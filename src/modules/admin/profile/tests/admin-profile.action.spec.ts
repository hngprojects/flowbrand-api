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
  });});