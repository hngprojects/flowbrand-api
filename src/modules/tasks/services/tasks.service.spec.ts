import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FunnelModelAction } from '../../funnels/actions/funnel.action';
import { UploadedDocumentModelAction } from '../../upload/actions/uploaded-document.action';
import { APP_EVENTS } from '../../../common/constants/app-events';

describe('TasksService', () => {
  let service: TasksService;
  let funnelAction: jest.Mocked<FunnelModelAction>;
  let uploadAction: jest.Mocked<UploadedDocumentModelAction>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const mockFunnelAction = {
      findStuckFunnels: jest.fn(),
      markFunnelsFailed: jest.fn(),
    };
    const mockUploadAction = {
      findStuckUploads: jest.fn(),
      markUploadsFailed: jest.fn(),
    };
    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: FunnelModelAction, useValue: mockFunnelAction },
        { provide: UploadedDocumentModelAction, useValue: mockUploadAction },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    funnelAction = module.get(FunnelModelAction);
    uploadAction = module.get(UploadedDocumentModelAction);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should reap stuck funnels, emit events, and return the correct count', async () => {
    funnelAction.findStuckFunnels.mockResolvedValue([{ id: 'f1', user_id: 'u1' }] as any);
    uploadAction.findStuckUploads.mockResolvedValue([]);

    const result = await service.runSweeps();

    expect(funnelAction.markFunnelsFailed).toHaveBeenCalledWith(['f1']);
    expect(eventEmitter.emit).toHaveBeenCalledWith(APP_EVENTS.FUNNEL_FAILED, expect.anything());
    
    expect(result.funnelsReaped).toBe(1);
    expect(result.uploadsReaped).toBe(0);
  });

  it('should reap stuck uploads and return the correct count', async () => {
    funnelAction.findStuckFunnels.mockResolvedValue([]);
    uploadAction.findStuckUploads.mockResolvedValue([{ id: 'u1', user_id: 'u1' }] as any);

    const result = await service.runSweeps();

    expect(uploadAction.markUploadsFailed).toHaveBeenCalledWith(['u1'], expect.any(String));
    
    expect(result.funnelsReaped).toBe(0);
    expect(result.uploadsReaped).toBe(1);
  });
});