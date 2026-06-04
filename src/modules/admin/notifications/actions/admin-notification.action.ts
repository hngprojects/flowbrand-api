import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AdminNotification } from '../entities/admin-notification.entity';
import {
  AdminNotificationReadFilter,
  AdminNotificationType,
  AdminNotificationTypeFilter,
} from '../enums/admin-notification.enum';

@Injectable()
export class AdminNotificationModelAction extends AbstractModelAction<AdminNotification> {
  constructor(
    @InjectRepository(AdminNotification)
    repository: Repository<AdminNotification>,
  ) {
    super(repository, AdminNotification);
  }

  async listForAdminPaginated(
    adminId: string,
    typeFilter: AdminNotificationTypeFilter,
    readFilter: AdminNotificationReadFilter,
    starred: boolean | undefined,
    page: number,
    perPage: number,
  ): Promise<[AdminNotification[], number]> {
    const query = this.repository
      .createQueryBuilder('notification')
      .where('notification.admin_id = :adminId', { adminId });

    if (typeFilter !== AdminNotificationTypeFilter.ALL) {
      query.andWhere('notification.type = :type', { type: typeFilter });
    }

    if (readFilter === AdminNotificationReadFilter.UNREAD) {
      query.andWhere('notification.is_read = false');
    } else if (readFilter === AdminNotificationReadFilter.READ) {
      query.andWhere('notification.is_read = true');
    }

    if (starred !== undefined) {
      query.andWhere('notification.is_starred = :starred', { starred });
    }

    return query
      .orderBy('notification.created_at', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();
  }

  /** Unfiltered unread total for the meta block (FR-2). */
  async countUnread(adminId: string): Promise<number> {
    return this.repository.count({ where: { admin_id: adminId, is_read: false } });
  }

  async findOwnedById(notificationId: string, adminId: string): Promise<AdminNotification | null> {
    return this.repository.findOne({ where: { id: notificationId, admin_id: adminId } });
  }

  /** Scoped single mark-as-read; skips the write when already read (EC-02). */
  async markAsRead(notificationId: string, adminId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ is_read: true, read_at: () => 'NOW()' })
      .where('id = :notificationId', { notificationId })
      .andWhere('admin_id = :adminId', { adminId })
      .andWhere('is_read = false')
      .execute();

    return result.affected ?? 0;
  }

  /** Marks all (optionally one type) as read; WHERE is_read = false makes the all-read case a zero-write no-op (EC-02). */
  async markAllAsRead(adminId: string, type?: AdminNotificationType): Promise<number> {
    const query = this.repository
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ is_read: true, read_at: () => 'NOW()' })
      .where('admin_id = :adminId', { adminId })
      .andWhere('is_read = false');

    if (type) {
      query.andWhere('type = :type', { type });
    }

    const result = await query.execute();
    return result.affected ?? 0;
  }

  /** Marks the owned subset of ids as unread; non-owned ids are silently ignored (FR-8, EC-03). */
  async markUnreadByIds(adminId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.repository
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ is_read: false, read_at: null })
      .where('admin_id = :adminId', { adminId })
      .andWhere('id IN (:...ids)', { ids })
      .andWhere('is_read = true')
      .execute();

    return result.affected ?? 0;
  }

  async markAllUnread(adminId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ is_read: false, read_at: null })
      .where('admin_id = :adminId', { adminId })
      .andWhere('is_read = true')
      .execute();

    return result.affected ?? 0;
  }

  async deleteOwnedById(notificationId: string, adminId: string): Promise<number> {
    const result = await this.repository.delete({ id: notificationId, admin_id: adminId });
    return result.affected ?? 0;
  }

  /** Deletes only the owned subset of ids; never errors on non-owned ids (EC-03, SEC-01). */
  async deleteOwnedByIds(adminId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.repository.delete({ admin_id: adminId, id: In(ids) });
    return result.affected ?? 0;
  }

  /** Always scoped to one admin; there is no unscoped delete path (SEC-02). */
  async deleteAllForAdmin(adminId: string): Promise<number> {
    const result = await this.repository.delete({ admin_id: adminId });
    return result.affected ?? 0;
  }

  /** Atomic DB-level flip; no read-modify-write window between concurrent toggles (FR-7). */
  async toggleStarred(notificationId: string, adminId: string): Promise<AdminNotification | null> {
    await this.repository
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ is_starred: () => 'NOT is_starred' })
      .where('id = :notificationId', { notificationId })
      .andWhere('admin_id = :adminId', { adminId })
      .execute();

    return this.repository.findOne({ where: { id: notificationId, admin_id: adminId } });
  }

  /**
   * Single multi-row INSERT used when an event fans out to every admin (FR-9).
   * ON CONFLICT DO NOTHING defers to the partial unique risk index, so concurrent
   * risk scans cannot insert duplicate alerts. Returns the number of rows inserted.
   */
  async createMany(payloads: Partial<AdminNotification>[]): Promise<number> {
    if (payloads.length === 0) {
      return 0;
    }

    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .into(AdminNotification)
      .values(payloads as QueryDeepPartialEntity<AdminNotification>[])
      .orIgnore()
      .returning('id')
      .execute();

    return Array.isArray(result.raw) ? result.raw.length : 0;
  }

  /** Stage ids among `stageIds` that already have a risk notification; one batched dedup query (FR-9). */
  async riskFlaggedStageIds(stageIds: string[]): Promise<string[]> {
    if (stageIds.length === 0) {
      return [];
    }

    const rows: { stage_id: string }[] = await this.repository
      .createQueryBuilder('notification')
      .select("DISTINCT notification.metadata ->> 'stage_id'", 'stage_id')
      .where('notification.type = :type', { type: AdminNotificationType.RISK })
      .andWhere("notification.metadata ->> 'stage_id' IN (:...stageIds)", { stageIds })
      .getRawMany();

    return rows.map((row) => row.stage_id);
  }
}
