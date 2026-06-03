import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { AdminProfileModelAction } from '../actions/admin-profile.action';

describe('AdminProfileModelAction', () => {
  it('updates profile without an enclosing transaction', async () => {
    const action = new AdminProfileModelAction({} as Repository<User>);
    const updateSpy = jest.spyOn(action, 'update').mockResolvedValue(null);

    await action.updateProfile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      full_name: 'Jane Updated',
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionOptions: { useTransaction: false },
        identifierOptions: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        updatePayload: { full_name: 'Jane Updated' },
      }),
    );
  });

  it('updates password_hash through action-layer method', async () => {
    const action = new AdminProfileModelAction({} as Repository<User>);
    const updateSpy = jest.spyOn(action, 'update').mockResolvedValue(null);

    await action.updatePasswordHash('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new-password-hash');

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionOptions: { useTransaction: false },
        identifierOptions: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        updatePayload: { password_hash: 'new-password-hash' },
      }),
    );
  });

  it('revokeAllSessions returns affected rows count', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({ affected: 3 });
    const getRepository = jest.fn().mockReturnValue({ update: mockUpdate });

    const repository = {
      manager: { getRepository },
    } as unknown as Repository<User>;

    const action = new AdminProfileModelAction(repository);

    await expect(action.revokeAllSessions('user-1')).resolves.toBe(3);
    expect(getRepository).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      { user_id: 'user-1', is_revoked: false },
      expect.objectContaining({ is_revoked: true, revoked_at: expect.any(Date) }),
    );
  });
});
