import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationFilter } from '../enums/notification-filter.enum';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';

@Injectable()
export class NotificationModelAction extends AbstractModelAction<Notification> {
  constructor(
    @InjectRepository(Notification)
    repository: Repository<Notification>,
  ) {
    super(repository, Notification);
  }

  async listForUserPaginated(
    userId: string,
    filter: NotificationFilter,
    page: number,
    perPage: number,
  ): Promise<[Notification[], number]> {
    const query = this.repository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId });

    if (filter === NotificationFilter.UNREAD) {
      query.andWhere('notification.is_read = false');
    } else if (filter === NotificationFilter.READ) {
      query.andWhere('notification.is_read = true');
    }

    return query
      .orderBy('notification.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();
  }

  async countUnread(userId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId })
      .andWhere('notification.is_read = false')
      .getCount();
  }

  async findOwnedById(notificationId: string, userId: string): Promise<Notification | null> {
    return this.repository.findOne({
      where: { id: notificationId, user_id: userId },
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Notification)
      .set({ is_read: true, read_at: () => 'NOW()' })
      .where('id = :notificationId', { notificationId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();

    return result.affected ?? 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Notification)
      .set({ is_read: true, read_at: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();

    return result.affected ?? 0;
  }

  async markAllAsUnread(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Notification)
      .set({ is_read: false, read_at: null })
      .where('user_id = :userId', { userId })
      .andWhere('is_read = true')
      .execute();

    return result.affected ?? 0;
  }

  async deleteOwnedById(notificationId: string, userId: string): Promise<number> {
    const result = await this.repository.delete({ id: notificationId, user_id: userId });
    return result.affected ?? 0;
  }
}
