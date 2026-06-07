import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { AdminLog } from '../../modules/admin/logs/entities/admin-log.entity';
import { AdminLogActionType, AdminLogStatus } from '../../modules/admin/logs/enums/admin-log.enum';

/** Keys whose (lowercased) name contains any of these are redacted (FR-4, SEC-01). */
const SENSITIVE_KEY_FRAGMENTS = ['password', 'token', 'hash', 'secret', 'cvv', 'pin', 'card_number'];
const REDACTED = '[REDACTED]';
/** EC-03: cap any single string value so multi-MB blobs never reach the jsonb column. */
const MAX_STRING_LENGTH = 500;
/** Defensive recursion cap for pathological/circular metadata shapes. */
const MAX_SCRUB_DEPTH = 8;
/** ip_address column is varchar(45) — a full IPv6 textual address. */
const MAX_IP_LENGTH = 45;

/**
 * Shared audit-trail writer (BE-ADM-609). Persists admin_logs rows for the
 * feed served by GET /admin/logs (BE-ADM-608).
 *
 * Non-blocking by contract (FR-2): log() returns immediately; the insert runs
 * on a later tick and a failure is only ever reported via Logger.error. A
 * logging problem must never slow down or fail the parent endpoint (EC-01).
 */
@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(
    @InjectRepository(AdminLog)
    private readonly adminLogRepository: Repository<AdminLog>,
  ) {}

  log(
    userId: string | null,
    actionType: AdminLogActionType,
    description: string,
    req: Request | null,
    status: AdminLogStatus,
    metadata?: Record<string, unknown>,
  ): void {
    try {
      // Capture request-derived data synchronously: the request object may be
      // recycled by the framework before the deferred insert runs.
      const ipAddress = this.extractIpAddress(req);
      const scrubbedMetadata = metadata ? this.scrubObject(metadata, 0) : {};

      setImmediate(() => {
        // The outer try/catch has already returned by the time this runs, so
        // the deferred call needs its own guard for synchronous explosions.
        try {
          const entry = this.adminLogRepository.create({
            user_id: userId,
            action_type: actionType,
            description,
            ip_address: ipAddress,
            status,
            metadata: scrubbedMetadata,
          });
          void this.adminLogRepository
            .save(entry)
            .catch((error: unknown) => this.reportFailure(actionType, error));
        } catch (error: unknown) {
          this.reportFailure(actionType, error);
        }
      });
    } catch (error: unknown) {
      // EC-01 / AC-07: even unexpected scrubbing failures stay silent.
      this.reportFailure(actionType, error);
    }
  }

  /** FR-3: prefer the proxy-forwarded client IP, fall back to the socket IP. */
  private extractIpAddress(req: Request | null): string | null {
    if (!req) {
      return null;
    }

    const forwardedFor = req.headers?.['x-forwarded-for'];
    const rawForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const clientIp = rawForwarded?.split(',')[0]?.trim() || req.ip || null;

    return clientIp ? clientIp.slice(0, MAX_IP_LENGTH) : null;
  }

  /** FR-4: redact sensitive keys and truncate oversized strings, recursively. */
  private scrubObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
    const scrubbed: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      scrubbed[key] = this.isSensitiveKey(key) ? REDACTED : this.scrubValue(entry, depth + 1);
    }

    return scrubbed;
  }

  private scrubValue(value: unknown, depth: number): unknown {
    if (typeof value === 'string') {
      return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
    }

    if (depth >= MAX_SCRUB_DEPTH) {
      return REDACTED;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.scrubValue(entry, depth + 1));
    }

    if (value !== null && typeof value === 'object') {
      return this.scrubObject(value as Record<string, unknown>, depth);
    }

    return value;
  }

  private isSensitiveKey(key: string): boolean {
    const lowered = key.toLowerCase();
    return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment));
  }

  private reportFailure(actionType: AdminLogActionType, error: unknown): void {
    const detail = error instanceof Error ? error.stack : String(error);
    this.logger.error(`Failed to write admin log entry for action '${actionType}'`, detail);
  }
}
