import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { APP_EVENTS } from '../../../common/constants/app-events';
import {
  AccountDeletedEvent,
  FeedbackSubmittedEvent,
  FunnelDeletedEvent,
  FunnelFailedEvent,
  FunnelGeneratedEvent,
  PasswordChangedEvent,
  ProfileUpdatedEvent,
  StageCompletedEvent,
  StageUnlockedEvent,
  TaskCompletedEvent,
  TaskReopenedEvent,
  UserSignedInEvent,
  UserSignedUpEvent,
} from '../../../common/events/events';
import { ActivityEventModelAction } from '../actions/activity-event.action';
import { ActivityListener } from '../listeners/activity.listener';

const mockActivityAction = { create: jest.fn() };

describe('ActivityListener', () => {
  let listener: ActivityListener;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockActivityAction.create.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityListener,
        { provide: ActivityEventModelAction, useValue: mockActivityAction },
      ],
    }).compile();
    listener = module.get<ActivityListener>(ActivityListener);
  });

  const lastPayload = () => mockActivityAction.create.mock.calls[0][0].createPayload;

  it('writes a funnel.generated row with funnel_id and businessName metadata', async () => {
    await listener.onFunnelGenerated(new FunnelGeneratedEvent('user-1', 'funnel-1', 'Acme'));

    expect(mockActivityAction.create).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        event_type: APP_EVENTS.FUNNEL_GENERATED,
        funnel_id: 'funnel-1',
        stage_id: null,
        task_id: null,
        metadata: { businessName: 'Acme' },
      }),
    );
  });

  it('writes a funnel.failed row', async () => {
    await listener.onFunnelFailed(new FunnelFailedEvent('user-1', 'funnel-1'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({ event_type: APP_EVENTS.FUNNEL_FAILED, funnel_id: 'funnel-1' }),
    );
  });

  it('AC-11: writes a funnel.deleted row with funnelName in metadata', async () => {
    await listener.onFunnelDeleted(new FunnelDeletedEvent('user-1', 'funnel-1', 'Acme Studio'));

    expect(lastPayload()).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        event_type: APP_EVENTS.FUNNEL_DELETED,
        funnel_id: 'funnel-1',
        metadata: { funnelName: 'Acme Studio' },
      }),
    );
  });

  it('writes a stage.completed row with stage context in metadata', async () => {
    await listener.onStageCompleted(
      new StageCompletedEvent('user-1', 'funnel-1', 'stage-1', 1, 'Awareness', 'stage-2', 'Interest'),
    );
    const payload = lastPayload();
    expect(payload).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.STAGE_COMPLETED,
        funnel_id: 'funnel-1',
        stage_id: 'stage-1',
      }),
    );
    expect(payload.metadata).toEqual({
      stagePosition: 1,
      stageName: 'Awareness',
      unlockedNextStageId: 'stage-2',
      unlockedNextStageName: 'Interest',
    });
  });

  it('writes a stage.unlocked row', async () => {
    await listener.onStageUnlocked(new StageUnlockedEvent('user-1', 'funnel-1', 'stage-2', 2, 'Interest'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.STAGE_UNLOCKED,
        funnel_id: 'funnel-1',
        stage_id: 'stage-2',
      }),
    );
  });

  it('writes a task.completed row with task_id', async () => {
    await listener.onTaskCompleted(new TaskCompletedEvent('user-1', 'funnel-1', 'stage-1', 'task-1', 'Post on X'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.TASK_COMPLETED,
        funnel_id: 'funnel-1',
        stage_id: 'stage-1',
        task_id: 'task-1',
        metadata: { taskName: 'Post on X' },
      }),
    );
  });

  it('writes a task.reopened row with task_id', async () => {
    await listener.onTaskReopened(new TaskReopenedEvent('user-1', 'funnel-1', 'stage-1', 'task-1', 'Post on X'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({ event_type: APP_EVENTS.TASK_REOPENED, task_id: 'task-1' }),
    );
  });

  it('writes a feedback.submitted row', async () => {
    await listener.onFeedbackSubmitted(new FeedbackSubmittedEvent('user-1', 'funnel-1', 'stage-1', 'fb-1'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.FEEDBACK_SUBMITTED,
        metadata: { feedbackId: 'fb-1' },
      }),
    );
  });

  it('writes a user.profile_updated row with a copied updatedFields array', async () => {
    await listener.onProfileUpdated(new ProfileUpdatedEvent('user-1', ['full_name', 'country']));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.PROFILE_UPDATED,
        metadata: { updatedFields: ['full_name', 'country'] },
      }),
    );
  });

  it('writes a user.password_changed row', async () => {
    await listener.onPasswordChanged(new PasswordChangedEvent('user-1'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({ event_type: APP_EVENTS.PASSWORD_CHANGED, user_id: 'user-1' }),
    );
  });

  it('writes a user.signed_up row with request metadata', async () => {
    await listener.onUserSignedUp(new UserSignedUpEvent('user-1', '1.2.3.4', 'jest'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.USER_SIGNED_UP,
        metadata: { ip: '1.2.3.4', userAgent: 'jest' },
      }),
    );
  });

  it('writes a user.signed_in row with request metadata', async () => {
    await listener.onUserSignedIn(new UserSignedInEvent('user-1', '1.2.3.4', 'jest'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.USER_SIGNED_IN,
        metadata: { ip: '1.2.3.4', userAgent: 'jest' },
      }),
    );
  });

  it('writes a user.account_deleted row', async () => {
    await listener.onAccountDeleted(new AccountDeletedEvent('user-1'));
    expect(lastPayload()).toEqual(
      expect.objectContaining({
        event_type: APP_EVENTS.ACCOUNT_DELETED,
        user_id: 'user-1',
        metadata: {},
      }),
    );
  });

  it('persists with useTransaction: false (emit-after-commit, no nested tx)', async () => {
    await listener.onFunnelFailed(new FunnelFailedEvent('user-1', 'funnel-1'));
    expect(mockActivityAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ transactionOptions: { useTransaction: false } }),
    );
  });

  it('swallows a persist failure and never rethrows (listener-safety contract)', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockActivityAction.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      listener.onTaskCompleted(new TaskCompletedEvent('user-1', 'funnel-1', 'stage-1', 'task-1', 'Post on X')),
    ).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});
