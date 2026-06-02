import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { AdminProfileModelAction } from '../actions/admin-profile.action';

describe('AdminProfileModelAction', () => {
  it('uses transactional updates for profile changes', async () => {
    const action = new AdminProfileModelAction({} as Repository<User>);
    const updateSpy = jest.spyOn(action, 'update').mockResolvedValue(null);

    await action.updateProfile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      full_name: 'Jane Updated',
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierOptions: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        updatePayload: { full_name: 'Jane Updated' },
      }),
    );

    expect(updateSpy.mock.calls[0][0]).not.toHaveProperty('transactionOptions');
  });
});