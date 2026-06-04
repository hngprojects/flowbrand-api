import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackSubmittedEvent, StageCompletedEvent } from '../../../../common/events/events';
import { UserModelAction } from '../../../users/actions/user.action';
import { User } from '../../../users/entities/user.entity';
import { AdminNotificationType } from '../enums/admin-notification.enum';
import { AdminNotificationListener } from '../listeners/admin-notification.listener';
import { AdminNotificationsService } from '../services/admin-notifications.service';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FUNNEL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FEEDBACK_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const mockService = {
  notifyAllAdmins: jest.fn(),
};

const mockUserAction = {
  findById: jest.fn(),
};

const stageCompletedEvent = (): StageCompletedEvent =>
  new StageCompletedEvent(USER_ID, FUNNEL_ID, STAGE_ID, 1, 'Build Awareness', null, null);

const feedbackSubmittedEvent = (): FeedbackSubmittedEvent =>
  new FeedbackSubmittedEvent(USER_ID, FUNNEL_ID, STAGE_ID, FEEDBACK_ID);

describe('AdminNotificationListener', () => {
  let listener: AdminNotificationListener;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationListener,
        { provide: AdminNotificationsService, useValue: mockService },
        { provide: UserModelAction, useValue: mockUserAction },
      ],
    }).compile();
    listener = module.get<AdminNotificationListener>(AdminNotificationListener);
  });

  describe('onStageCompleted', () => {
    it('FR-9: dispatches a milestone notification to all admins with sender details', async () => {
      mockUserAction.findById.mockResolvedValue({ full_name: 'Ada Obi', avatar_url: 'https://cdn/a.png' } as User);
      mockService.notifyAllAdmins.mockResolvedValue(2);

      await listener.onStageCompleted(stageCompletedEvent());

      expect(mockService.notifyAllAdmins).toHaveBeenCalledWith(
        AdminNotificationType.MILESTONE,
        'Stage milestone reached',
        'Ada Obi completed the "Build Awareness" stage',
        expect.objectContaining({ user_id: USER_ID, funnel_id: FUNNEL_ID, stage_id: STAGE_ID }),
        { sender_name: 'Ada Obi', sender_avatar_url: 'https://cdn/a.png' },
      );
    });

    it('falls back to a generic sender when the user cannot be resolved', async () => {
      mockUserAction.findById.mockResolvedValue(null);
      mockService.notifyAllAdmins.mockResolvedValue(1);

      await listener.onStageCompleted(stageCompletedEvent());

      expect(mockService.notifyAllAdmins).toHaveBeenCalledWith(
        AdminNotificationType.MILESTONE,
        'Stage milestone reached',
        'A user completed the "Build Awareness" stage',
        expect.any(Object),
        { sender_name: null, sender_avatar_url: null },
      );
    });

    it('never rethrows when dispatch fails (fire-and-forget contract)', async () => {
      mockUserAction.findById.mockResolvedValue(null);
      mockService.notifyAllAdmins.mockRejectedValue(new Error('db down'));

      await expect(listener.onStageCompleted(stageCompletedEvent())).resolves.toBeUndefined();
    });
  });

  describe('onFeedbackSubmitted', () => {
    it('FR-9: dispatches a feedback notification to all admins', async () => {
      mockUserAction.findById.mockResolvedValue({ full_name: 'Ada Obi', avatar_url: null } as User);
      mockService.notifyAllAdmins.mockResolvedValue(2);

      await listener.onFeedbackSubmitted(feedbackSubmittedEvent());

      expect(mockService.notifyAllAdmins).toHaveBeenCalledWith(
        AdminNotificationType.FEEDBACK,
        'New stage feedback submitted',
        'Ada Obi submitted feedback on a stage',
        expect.objectContaining({ feedback_id: FEEDBACK_ID }),
        { sender_name: 'Ada Obi', sender_avatar_url: null },
      );
    });

    it('never rethrows when dispatch fails (fire-and-forget contract)', async () => {
      mockUserAction.findById.mockRejectedValue(new Error('db down'));

      await expect(listener.onFeedbackSubmitted(feedbackSubmittedEvent())).resolves.toBeUndefined();
      expect(mockService.notifyAllAdmins).not.toHaveBeenCalled();
    });
  });
});
