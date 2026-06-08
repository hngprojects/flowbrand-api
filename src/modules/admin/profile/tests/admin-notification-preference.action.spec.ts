import { Repository } from 'typeorm';
import { AdminNotificationPreferenceModelAction } from '../actions/admin-notification-preference.action';
import { AdminNotificationPreference } from '../entities/admin-notification-preference.entity';

describe('AdminNotificationPreferenceModelAction', () => {
  it('creates defaults without a transaction by default', async () => {
    const action = new AdminNotificationPreferenceModelAction({} as Repository<AdminNotificationPreference>);
    const createSpy = jest.spyOn(action, 'create').mockResolvedValue({} as AdminNotificationPreference);

    await action.createDefaultForUser('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        createPayload: { user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        transactionOptions: { useTransaction: false },
      }),
    );
  });

  it('creates defaults within a supplied transaction manager', async () => {
    const transaction = {} as never;
    const action = new AdminNotificationPreferenceModelAction({} as Repository<AdminNotificationPreference>);
    const createSpy = jest.spyOn(action, 'create').mockResolvedValue({} as AdminNotificationPreference);

    await action.createDefaultForUser('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', transaction);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionOptions: { useTransaction: true, transaction },
      }),
    );
  });

  it('updates by user id without a transaction', async () => {
    const action = new AdminNotificationPreferenceModelAction({} as Repository<AdminNotificationPreference>);
    const updateSpy = jest.spyOn(action, 'update').mockResolvedValue({} as AdminNotificationPreference);

    await action.updateByUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { push_email: false });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierOptions: { user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        updatePayload: { push_email: false },
        transactionOptions: { useTransaction: false },
      }),
    );
  });
});