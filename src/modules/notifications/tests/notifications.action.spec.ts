import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationModelAction } from '../actions/notification.action';
import { NotificationFilter } from '../enums/notification-filter.enum';
import { Notification } from '../entities/notification.entity';

function createQueryBuilderMock() {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getCount: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    delete: jest.fn().mockReturnThis(),
  };
}

describe('NotificationModelAction', () => {
  let action: NotificationModelAction;
  let queryBuilder: ReturnType<typeof createQueryBuilderMock>;
  const repositoryMock = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    queryBuilder = createQueryBuilderMock();
    repositoryMock.createQueryBuilder.mockReturnValue(queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationModelAction, { provide: getRepositoryToken(Notification), useValue: repositoryMock }],
    }).compile();

    action = module.get(NotificationModelAction);
  });

  it('lists notifications with the requested filter and pagination', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[{ id: 'notif-1' } as Notification], 1]);

    await expect(action.listForUserPaginated('user-1', NotificationFilter.UNREAD, 3, 10)).resolves.toEqual([[{ id: 'notif-1' }], 1]);
    expect(repositoryMock.createQueryBuilder).toHaveBeenCalledWith('notification');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('notification.is_read = false');
    expect(queryBuilder.skip).toHaveBeenCalledWith(20);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('counts unread notifications only for the current user', async () => {
    queryBuilder.getCount.mockResolvedValue(4);

    await expect(action.countUnread('user-1')).resolves.toBe(4);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('notification.is_read = false');
  });

  it('updates a single notification as read with a scoped WHERE clause', async () => {
    queryBuilder.execute.mockResolvedValue({ affected: 1 });

    await expect(action.markAsRead('notif-1', 'user-1')).resolves.toBe(1);
    expect(queryBuilder.update).toHaveBeenCalledWith(Notification);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user_id = :userId', { userId: 'user-1' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('is_read = false');
  });

  it('bulk marks unread notifications as read with one update query', async () => {
    queryBuilder.execute.mockResolvedValue({ affected: 5 });

    await expect(action.markAllAsRead('user-1')).resolves.toBe(5);
    expect(queryBuilder.update).toHaveBeenCalledWith(Notification);
    expect(queryBuilder.where).toHaveBeenCalledWith('user_id = :userId', { userId: 'user-1' });
  });

  it('bulk marks read notifications as unread with one update query', async () => {
    queryBuilder.execute.mockResolvedValue({ affected: 2 });

    await expect(action.markAllAsUnread('user-1')).resolves.toBe(2);
    expect(queryBuilder.set).toHaveBeenCalledWith({ is_read: false, read_at: null });
  });

  it('deletes a notification only for the owning user', async () => {
    repositoryMock.delete.mockResolvedValue({ affected: 1 });

    await expect(action.deleteOwnedById('notif-1', 'user-1')).resolves.toBe(1);
    expect(repositoryMock.delete).toHaveBeenCalledWith({ id: 'notif-1', user_id: 'user-1' });
  });
});