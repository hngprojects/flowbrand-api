import { Injectable, Logger } from '@nestjs/common';

/** Shape of the fields we read from the keyless geo-IP endpoint (freeipapi.com). */
interface GeoLookupResponse {
  regionName?: string;
  countryCode?: string;
}

/**
 * Resolves an IP address to a compact "Region, CC" label (for example "Lagos, NG")
 * for the admin logs feed.
 *
 * Uses freeipapi.com, a keyless HTTPS geo-IP endpoint, over the built-in fetch.
 * The offline geo-IP database that would have made this dependency-free of a
 * network call is a new package, which the team blocks, so we look it up at read
 * time instead. Results are cached per IP for the process lifetime, and every
 * failure path degrades to null so the logs endpoint never fails when lookup is
 * unavailable.
 */
@Injectable()
export class GeoLocationService {
  private readonly logger = new Logger(GeoLocationService.name);
  private readonly cache = new Map<string, string | null>();

  private static readonly ENDPOINT = 'https://freeipapi.com/api/json';
  private static readonly LOOKUP_TIMEOUT_MS = 2000;

  /** Resolves a single IP, using and populating the per-process cache. */
  async resolve(ip: string | null): Promise<string | null> {
    if (!ip || this.isNonRoutable(ip)) {
      return null;
    }

    const cached = this.cache.get(ip);
    if (cached !== undefined) {
      return cached;
    }

    const location = await this.lookup(ip);
    this.cache.set(ip, location);
    return location;
  }

  /**
   * Resolves many IPs at once, deduplicating lookups, and returns labels aligned
   * one-to-one with the input order (null entries stay null).
   */
  async resolveMany(ips: Array<string | null>): Promise<Array<string | null>> {
    const unique = [...new Set(ips.filter((ip): ip is string => Boolean(ip)))];
    await Promise.all(unique.map((ip) => this.resolve(ip)));
    return ips.map((ip) => (ip ? (this.cache.get(ip) ?? null) : null));
  }

  private async lookup(ip: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GeoLocationService.LOOKUP_TIMEOUT_MS);

    try {
      const response = await fetch(`${GeoLocationService.ENDPOINT}/${ip}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as GeoLookupResponse;
      return this.format(body);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Geo lookup failed for ${ip}: ${detail}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private format(body: GeoLookupResponse): string | null {
    const region = this.clean(body.regionName);
    const country = this.clean(body.countryCode);

    if (!country) {
      return null;
    }

    return region ? `${region}, ${country}` : country;
  }

  /** Normalises a field, treating blanks and the provider's "-"/"Unknown" as absent. */
  private clean(value: string | undefined): string | null {
    const trimmed = value?.trim();

    if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'unknown') {
      return null;
    }

    return trimmed;
  }

  /** Private, loopback and link-local addresses have no public geolocation. */
  private isNonRoutable(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
      ip.startsWith('fc') ||
      ip.startsWith('fd')
    );
  }
}
