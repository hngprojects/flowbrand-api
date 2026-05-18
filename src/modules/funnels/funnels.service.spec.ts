import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FunnelsService } from './funnels.service';

function createMockQB(returnValues: any = {}) {
  const qb: any = {
    calls: [],
    where() { this.calls.push(['where', Array.from(arguments)]); return this; },
    orderBy() { this.calls.push(['orderBy', Array.from(arguments)]); return this; },
    addOrderBy() { this.calls.push(['addOrderBy', Array.from(arguments)]); return this; },
    leftJoinAndSelect() { this.calls.push(['leftJoinAndSelect', Array.from(arguments)]); return this; },
    select() { this.calls.push(['select', Array.from(arguments)]); return this; },
    addSelect() { this.calls.push(['addSelect', Array.from(arguments)]); return this; },
    groupBy() { this.calls.push(['groupBy', Array.from(arguments)]); return this; },
    skip() { this.calls.push(['skip', Array.from(arguments)]); return this; },
    take() { this.calls.push(['take', Array.from(arguments)]); return this; },
    getManyAndCount: async () => returnValues.getManyAndCount ?? [returnValues.funnels ?? [], returnValues.total ?? 0],
    getMany: async () => returnValues.stages ?? [],
    getRawMany: async () => returnValues.rawMany ?? [],
    getRawOne: async () => returnValues.rawOne ?? { total: 0, complete: 0 },
  };
  return qb;
}

describe('FunnelsService', () => {
  let service: FunnelsService;
  let funnelRepo: any;
  let stageRepo: any;
  let taskRepo: any;

  beforeEach(() => {
    funnelRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    stageRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    taskRepo = {
      createQueryBuilder: jest.fn(),
    };

    service = new FunnelsService(funnelRepo, stageRepo, taskRepo);
  });

  it('listForUser caps per_page at 20 and returns summaries', async () => {
    const sampleFunnel: any = { id: 'f1', business_name: 'B', creation_path: 'cp', status: 'active', created_at: new Date(), stages: [{ position: 1, name: 'S1', status: 'active' }] };
    const qb = createMockQB({ getManyAndCount: [ [sampleFunnel], 1 ] });
    funnelRepo.createQueryBuilder.mockReturnValue(qb);

    const res = await service.listForUser('user-1', 1, 100);
    expect(res.funnels.length).toBe(1);
    expect(res.funnels[0]).toMatchObject({
      funnelId: 'f1',
      businessName: 'B',
      creationPath: 'cp',
      status: 'active',
    });
    expect(res.pagination.perPage).toBe(20);
    expect(res.pagination.hasNext).toBe(false);
    expect(res.funnels[0].stages[0]).toEqual({ position: 1, name: 'S1', status: 'active' });
    expect(funnelRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('getFullFunnel throws NotFound when funnel missing', async () => {
    funnelRepo.findOne.mockResolvedValue(null);
    await expect(service.getFullFunnel('u1', 'f1')).rejects.toBeInstanceOf(NotFoundException);
    expect(funnelRepo.findOne).toHaveBeenCalledWith({ where: { id: 'f1', user_id: 'u1' } });
  });

  it('getStageDetail enforces lock and returns ForbiddenException with message', async () => {
    funnelRepo.findOne.mockResolvedValue({ id: 'f1', user_id: 'u1' });
    stageRepo.findOne.mockResolvedValue({ id: 's2', funnel_id: 'f1', position: 2, name: 'Stage 2', status: 'locked' });
    stageRepo.findOne.mockResolvedValueOnce({ id: 's2', funnel_id: 'f1', position: 2, name: 'Stage 2', status: 'locked' });
    stageRepo.findOne.mockResolvedValueOnce({ id: 's1', funnel_id: 'f1', position: 1, name: 'Stage 1', status: 'complete' });

    // first call finds the stage; second call finds prior stage
    stageRepo.findOne = jest.fn()
      .mockResolvedValueOnce({ id: 's2', funnel_id: 'f1', position: 2, name: 'Stage 2', status: 'locked' })
      .mockResolvedValueOnce({ id: 's1', funnel_id: 'f1', position: 1, name: 'Stage 1', status: 'complete' });

    await expect(service.getStageDetail('u1', 'f1', 's2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getStagesSummary returns lean stage payloads', async () => {
    funnelRepo.findOne.mockResolvedValue({ id: 'f1', user_id: 'u1' });
    const qb = createMockQB({
      stages: [
        { id: 's1', position: 1, name: 'S1', channel: 'email', status: 'active', unlocked_at: null, completed_at: null },
      ],
      rawMany: [{ stageId: 's1', total: 2, complete: 1 }],
    });
    stageRepo.createQueryBuilder.mockReturnValue(qb);
    taskRepo.createQueryBuilder.mockReturnValue(createMockQB({ rawMany: [{ stageId: 's1', total: 2, complete: 1 }] }));

    const res = await service.getStagesSummary('u1', 'f1');
    expect(res).toEqual([
      {
        stageId: 's1',
        position: 1,
        name: 'S1',
        channel: 'email',
        status: 'active',
        unlockedAt: null,
        completedAt: null,
        tasksTotal: 2,
        tasksComplete: 1,
      },
    ]);
  });

  it('getStageDetail returns a full stage payload when unlocked', async () => {
    funnelRepo.findOne.mockResolvedValue({ id: 'f1', user_id: 'u1' });
    stageRepo.findOne
      .mockResolvedValueOnce({
        id: 's2',
        funnel_id: 'f1',
        position: 2,
        name: 'Stage 2',
        channel: 'email',
        status: 'active',
        explanation: 'Ex',
        action_prompt: 'Act',
        unlocked_at: new Date(),
        completed_at: null,
      })
      .mockResolvedValueOnce({ id: 's1', funnel_id: 'f1', position: 1, name: 'Stage 1', status: 'complete' });
    taskRepo.createQueryBuilder.mockReturnValue(
      createMockQB({ stages: [{ id: 't1', position: 1, name: 'Task 1', status: 'complete' }], rawOne: { total: 1, complete: 1 } }),
    );

    const res = await service.getStageDetail('u1', 'f1', 's2');
    expect(res).toMatchObject({
      stageId: 's2',
      name: 'Stage 2',
      status: 'active',
      tasksTotal: 1,
      tasksComplete: 1,
    });
    expect(res.tasks[0]).toEqual({ id: 't1', position: 1, name: 'Task 1', status: 'complete' });
  });

  it('getFullFunnel runs expected query builders (no N+1)', async () => {
    funnelRepo.findOne.mockResolvedValue({ id: 'f1', user_id: 'u1' });
    const stages = [{ id: 's1', position: 1, name: 'S1', channel: 'email', status: 'active', tasks: [{ id: 't1', position: 1, name: 'T1', status: 'pending' }] }];
    const qbStages = createMockQB({ stages, rawMany: [{ stageId: 's1', total: 1, complete: 0 }] });
    stageRepo.createQueryBuilder.mockReturnValue(qbStages);

    const qbCounts = createMockQB({ rawMany: [{ stageId: 's1', total: 1, complete: 0 }] });
    taskRepo.createQueryBuilder.mockReturnValue(qbCounts);

    const res = await service.getFullFunnel('u1', 'f1');
    expect(res.stages.length).toBe(1);
    // assert repository query builders called
    expect(funnelRepo.findOne).toHaveBeenCalledTimes(1);
    expect(stageRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(taskRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});
