import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  FunnelGeneratedEvent,
  PaymentFailedEvent,
  PlanUpgradedEvent,
  StageCompletedEvent,
  StageUnlockedEvent,
  TaskCompletedEvent,
} from '../../../common/events/events';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { UserModelAction } from '../../users/actions/user.action';
import { PaymentModelAction } from '../../payments/actions/payment.model-action';
import { NotificationModelAction } from '../actions/notification.action';
import { NotificationsService } from '../notifications.service';
import { NotificationListener } from '../listeners/notification.listener';

const allPrefsOn = () => ({
  email_funnel_ready: true,
  email_stage_unlocked: true,
  email_stage_completed: true,
  email_weekly_digest: true,
  inapp_task_completed: true,
  inapp_stage_unlocked: true,
});

describe('NotificationListener', () => {
  let listener: NotificationListener;
  let prefs: ReturnType<typeof allPrefsOn>;

  const notificationsService = {
    createNotification: jest.fn(),
    getNotificationPreferences: jest.fn(),
  };
  const notificationAction = { existsForFunnelType: jest.fn() };
  const emailService = {
    sendStageCompleted: jest.fn(),
    sendStageUnlocked: jest.fn(),
    sendFunnelReady: jest.fn(),
    sendPaymentSuccessful: jest.fn(),
    sendPaymentFailed: jest.fn(),
  };
  const taskAction = { getFunnelTaskProgress: jest.fn() };
  const userAction = { findById: jest.fn() };
  const paymentModelAction = { findByReference: jest.fn().mockResolvedValue(null) };

  beforeEach(async () => {
    jest.clearAllMocks();
    prefs = allPrefsOn();
    notificationsService.getNotificationPreferences.mockImplementation(async () => prefs);
    notificationsService.createNotification.mockResolvedValue({});
    notificationAction.existsForFunnelType.mockResolvedValue(false);
    taskAction.getFunnelTaskProgress.mockResolvedValue({ total: 4, complete: 2 });
    userAction.findById.mockResolvedValue({ id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationListener,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationModelAction, useValue: notificationAction },
        { provide: EmailService, useValue: emailService },
        { provide: StageTaskModelAction, useValue: taskAction },
        { provide: UserModelAction, useValue: userAction },
        { provide: PaymentModelAction, useValue: paymentModelAction },
      ],
    }).compile();

    listener = module.get(NotificationListener);
  });

  const stageCompleted = () =>
    new StageCompletedEvent('user-1', 'funnel-1', 'stage-1', 1, 'Awareness', 'stage-2', 'Interest');
  const stageUnlocked = () => new StageUnlockedEvent('user-1', 'funnel-1', 'stage-2', 2, 'Interest');
  const funnelGenerated = () => new FunnelGeneratedEvent('user-1', 'funnel-1', 'Acme');
  const taskCompleted = () => new TaskCompletedEvent('user-1', 'funnel-1', 'stage-1', 'task-1', 'Post on X');

  it('AC-01: STAGE_COMPLETED creates a stage_completed in-app with the exact title and body', async () => {
    await listener.onStageCompleted(stageCompleted());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1',
      'stage_completed',
      'You completed "Awareness"',
      'Great job! You are ready for the next stage.',
      { funnelId: 'funnel-1', stageId: 'stage-1' },
    );
  });

  it('AC-02: STAGE_UNLOCKED creates a stage_unlocked in-app with the exact title and body', async () => {
    await listener.onStageUnlocked(stageUnlocked());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1',
      'stage_unlocked',
      '"Interest" is now active',
      'Start engaging with your audience this week.',
      { funnelId: 'funnel-1', stageId: 'stage-2' },
    );
  });

  it('AC-03: FUNNEL_GENERATED creates a funnel_ready in-app regardless of preferences', async () => {
    prefs.inapp_stage_unlocked = false;
    await listener.onFunnelGenerated(funnelGenerated());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1',
      'funnel_ready',
      'Your funnel is ready',
      'Your personalised plan has been created. Tap to start.',
      { funnelId: 'funnel-1' },
    );
  });

  it('AC-04: 50% completion creates a single funnel_progress notification', async () => {
    await listener.onTaskCompleted(taskCompleted());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1',
      'funnel_progress',
      'You are 50% through your funnel',
      "Keep going - you're halfway there.",
      { funnelId: 'funnel-1' },
    );
  });

  it('EC-01: funnel_progress is idempotent (skips when one already exists for the funnel)', async () => {
    notificationAction.existsForFunnelType.mockResolvedValue(true);
    await listener.onTaskCompleted(taskCompleted());

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('does not create funnel_progress below the 50% threshold', async () => {
    taskAction.getFunnelTaskProgress.mockResolvedValue({ total: 4, complete: 1 });
    await listener.onTaskCompleted(taskCompleted());

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('does not create funnel_progress when the funnel has no tasks', async () => {
    taskAction.getFunnelTaskProgress.mockResolvedValue({ total: 0, complete: 0 });
    await listener.onTaskCompleted(taskCompleted());

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('does not create funnel_progress when inapp_task_completed is false', async () => {
    prefs.inapp_task_completed = false;
    await listener.onTaskCompleted(taskCompleted());

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(taskAction.getFunnelTaskProgress).not.toHaveBeenCalled();
  });

  it('AC-05: inapp_stage_unlocked=false suppresses BOTH stage_completed and stage_unlocked (shared stage-events key)', async () => {
    prefs.inapp_stage_unlocked = false;
    await listener.onStageCompleted(stageCompleted());
    await listener.onStageUnlocked(stageUnlocked());

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('AC-06: no email dispatched when the relevant email_ preference is false', async () => {
    prefs.email_stage_completed = false;
    prefs.email_stage_unlocked = false;
    prefs.email_funnel_ready = false;

    await listener.onStageCompleted(stageCompleted());
    await listener.onStageUnlocked(stageUnlocked());
    await listener.onFunnelGenerated(funnelGenerated());

    expect(emailService.sendStageCompleted).not.toHaveBeenCalled();
    expect(emailService.sendStageUnlocked).not.toHaveBeenCalled();
    expect(emailService.sendFunnelReady).not.toHaveBeenCalled();
  });

  it('dispatches the stage-completed email to the user resolved from the event userId (SEC-02)', async () => {
    await listener.onStageCompleted(stageCompleted());

    expect(emailService.sendStageCompleted).toHaveBeenCalledWith(
      'ada@seil.app',
      { name: 'Ada', stageName: 'Awareness' },
      'user-1',
    );
  });

  it('skips email dispatch when the user cannot be resolved, without throwing', async () => {
    userAction.findById.mockResolvedValue(null);

    await expect(listener.onStageCompleted(stageCompleted())).resolves.toBeUndefined();
    expect(emailService.sendStageCompleted).not.toHaveBeenCalled();
  });

  it('AC-07: a handler failure is swallowed and never rethrown', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    notificationsService.createNotification.mockRejectedValueOnce(new Error('db down'));

    await expect(listener.onFunnelGenerated(funnelGenerated())).resolves.toBeUndefined();
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  // ─── onPlanUpgraded ────────────────────────────────────────────────────────

  const PAYMENT_ROW = {
    amount_kobo: 900000,
    card_last4: '4242',
    card_brand: 'visa',
    paid_at: new Date('2026-06-01T10:00:00Z'),
  };

  const planUpgraded = () => new PlanUpgradedEvent('user-1', 'pro', 'ref-abc');

  it('PLAN_UPGRADED: creates in-app notification and sends payment successful email on happy path', async () => {
    paymentModelAction.findByReference.mockResolvedValueOnce(PAYMENT_ROW);

    await listener.onPlanUpgraded(planUpgraded());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1', 'plan_upgraded', expect.any(String), expect.any(String), { plan: 'pro' },
    );
    expect(emailService.sendPaymentSuccessful).toHaveBeenCalledWith(
      'ada@seil.app',
      expect.objectContaining({ amount: '₦9,000.00', cardLast4: '4242', cardBrand: 'visa', reference: 'ref-abc' }),
      'user-1',
    );
  });

  it('PLAN_UPGRADED: warns and skips email when payment row is not found — in-app still created', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    paymentModelAction.findByReference.mockResolvedValueOnce(null);

    await listener.onPlanUpgraded(planUpgraded());

    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(emailService.sendPaymentSuccessful).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not found') }));
    warnSpy.mockRestore();
  });

  it('PLAN_UPGRADED: warns and skips email when amount_kobo is 0 (pricing misconfiguration)', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    paymentModelAction.findByReference.mockResolvedValueOnce({ ...PAYMENT_ROW, amount_kobo: 0 });

    await listener.onPlanUpgraded(planUpgraded());

    expect(emailService.sendPaymentSuccessful).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('amount') }));
    warnSpy.mockRestore();
  });

  it('PLAN_UPGRADED: SEC-02 — invalid card_last4 is replaced with null in email payload', async () => {
    paymentModelAction.findByReference.mockResolvedValueOnce({ ...PAYMENT_ROW, card_last4: 'abcd' });

    await listener.onPlanUpgraded(planUpgraded());

    expect(emailService.sendPaymentSuccessful).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cardLast4: null }),
      expect.any(String),
    );
  });

  it('PLAN_UPGRADED: missing paid_at produces paidAt: null in email payload', async () => {
    paymentModelAction.findByReference.mockResolvedValueOnce({ ...PAYMENT_ROW, paid_at: null });

    await listener.onPlanUpgraded(planUpgraded());

    expect(emailService.sendPaymentSuccessful).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ paidAt: null }),
      expect.any(String),
    );
  });

  // ─── onPaymentFailed ───────────────────────────────────────────────────────

  const paymentFailed = (reason = 'Insufficient funds') =>
    new PaymentFailedEvent('user-1', 'ref-abc', reason);

  it('PAYMENT_FAILED: creates in-app notification and sends payment failed email', async () => {
    await listener.onPaymentFailed(paymentFailed());

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1', 'payment_failed', expect.any(String), expect.any(String), { reference: 'ref-abc' },
    );
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith(
      'ada@seil.app',
      expect.objectContaining({ name: 'Ada', failureReason: 'Insufficient funds' }),
      'user-1',
    );
  });

  it('PAYMENT_FAILED: skips email (but still creates in-app) when user cannot be resolved', async () => {
    userAction.findById.mockResolvedValueOnce(null);

    await listener.onPaymentFailed(paymentFailed());

    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(emailService.sendPaymentFailed).not.toHaveBeenCalled();
  });
});
