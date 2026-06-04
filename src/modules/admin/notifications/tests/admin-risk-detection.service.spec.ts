import { Test, TestingModule } from '@nestjs/testing';
import { FunnelStageModelAction, StuckStageRow } from '../../../funnels/actions/funnel-stage.action';
import { AdminNotificationModelAction } from '../actions/admin-notification.action';
import { AdminNotificationType } from '../enums/admin-notification.enum';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { AdminRiskDetectionService } from '../services/admin-risk-detection.service';

const STAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_STAGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const stuckRow = (stageId: string): StuckStageRow => ({
  stage_id: stageId,
  stage_name: 'Build Awareness',
  funnel_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_full_name: 'Ada Obi',
  user_avatar_url: null,
  days_stuck: 16,
});

const mockStageAction = {
  findStuckStages: jest.fn(),
};

const mockNotificationsService = {
  notifyAllAdmins: jest.fn(),
};

const mockNotificationAction = {
  riskFlaggedStageIds: jest.fn(),
};

describe('AdminRiskDetectionService', () => {
  let service: AdminRiskDetectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRiskDetectionService,
        { provide: FunnelStageModelAction, useValue: mockStageAction },
        { provide: AdminNotificationsService, useValue: mockNotificationsService },
        { provide: AdminNotificationModelAction, useValue: mockNotificationAction },
      ],
    }).compile();
    service = module.get<AdminRiskDetectionService>(AdminRiskDetectionService);
  });

  it('FR-9: dispatches a risk notification for a newly stuck stage', async () => {
    mockStageAction.findStuckStages.mockResolvedValue([stuckRow(STAGE_ID)]);
    mockNotificationAction.riskFlaggedStageIds.mockResolvedValue([]);
    mockNotificationsService.notifyAllAdmins.mockResolvedValue(2);

    const notified = await service.runRiskScan();

    expect(notified).toBe(1);
    const threshold = mockStageAction.findStuckStages.mock.calls[0][0] as Date;
    expect(threshold).toBeInstanceOf(Date);
    expect(threshold.getTime()).toBeLessThan(Date.now() - 13 * 24 * 60 * 60 * 1000);
    expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledWith(
      AdminNotificationType.RISK,
      'User stuck on a stage',
      'Ada Obi has been on the "Build Awareness" stage for over 14 days',
      expect.objectContaining({ stage_id: STAGE_ID, days_stuck: 16 }),
      { sender_name: 'Ada Obi', sender_avatar_url: null },
    );
  });

  it('dedup: batches the lookup and skips stages that already produced a risk notification', async () => {
    mockStageAction.findStuckStages.mockResolvedValue([stuckRow(STAGE_ID), stuckRow(OTHER_STAGE_ID)]);
    mockNotificationAction.riskFlaggedStageIds.mockResolvedValue([STAGE_ID]);
    mockNotificationsService.notifyAllAdmins.mockResolvedValue(2);

    const notified = await service.runRiskScan();

    expect(notified).toBe(1);
    expect(mockNotificationAction.riskFlaggedStageIds).toHaveBeenCalledTimes(1);
    expect(mockNotificationAction.riskFlaggedStageIds).toHaveBeenCalledWith([STAGE_ID, OTHER_STAGE_ID]);
    expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledTimes(1);
    expect(mockNotificationsService.notifyAllAdmins).toHaveBeenCalledWith(
      AdminNotificationType.RISK,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ stage_id: OTHER_STAGE_ID }),
      expect.any(Object),
    );
  });

  it('does nothing when no stage is stuck, without running the dedup query', async () => {
    mockStageAction.findStuckStages.mockResolvedValue([]);

    const notified = await service.runRiskScan();

    expect(notified).toBe(0);
    expect(mockNotificationAction.riskFlaggedStageIds).not.toHaveBeenCalled();
    expect(mockNotificationsService.notifyAllAdmins).not.toHaveBeenCalled();
  });

  it('the cron wrapper never rethrows when the scan fails', async () => {
    mockStageAction.findStuckStages.mockRejectedValue(new Error('db down'));

    await expect(service.handleDailyRiskScan()).resolves.toBeUndefined();
  });
});
