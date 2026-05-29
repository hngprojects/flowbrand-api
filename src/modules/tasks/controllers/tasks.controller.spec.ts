import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from '../services/tasks.service';
import { HttpStatus } from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: { 
            runSweeps: jest.fn().mockResolvedValue({ funnelsReaped: 1, uploadsReaped: 0 }) 
          },
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  it('should call runSweeps and return success response with counts', async () => {
    const result = await controller.triggerReaper();
    
    expect(service.runSweeps).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.REAPER_TRIGGERED_SUCCESSFULLY,
      data: { funnelsReaped: 1, uploadsReaped: 0 },
    });
  });
});