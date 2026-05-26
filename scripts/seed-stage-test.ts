import 'reflect-metadata';
import { randomUUID } from 'crypto';
import dataSource from '../src/database/data-source';
import { Funnel } from '../src/modules/funnels/entities/funnel.entity';
import { FunnelStage } from '../src/modules/funnels/entities/funnel-stage.entity';
import { StageTask } from '../src/modules/funnels/entities/stage-task.entity';
import { FunnelStatus } from '../src/modules/funnels/enums/funnel-status.enum';
import { StageStatus } from '../src/modules/funnels/enums/stage-status.enum';
import { FunnelCreationPath } from '../src/modules/funnels/enums/funnel-creation-path.enum';

(async () => {
  try {
    await dataSource.initialize();

    const userId = '50e78561-2107-4f01-960e-06913d364617';

    const funnelRepo = dataSource.getRepository(Funnel);
    const stageRepo = dataSource.getRepository(FunnelStage);
    const taskRepo = dataSource.getRepository(StageTask);

    const funnel = await funnelRepo.save({
      user_id: userId,
      business_name: 'Swagger Stage Completion Test',
      creation_path: FunnelCreationPath.WIZARD,
      status: FunnelStatus.ACTIVE,
      idempotency_key: randomUUID(),
      business_context: { source: 'swagger-test' },
    });

    const stage1 = await stageRepo.save({
      funnel_id: funnel.id,
      position: 1,
      name: 'Swagger Stage 1',
      channel: 'email',
      explanation: 'seeded',
      action_prompt: 'seeded',
      status: StageStatus.ACTIVE,
      unlocked_at: new Date(),
    });

    const stage2 = await stageRepo.save({
      funnel_id: funnel.id,
      position: 2,
      name: 'Swagger Stage 2',
      channel: 'social',
      explanation: 'seeded',
      action_prompt: 'seeded',
      status: StageStatus.LOCKED,
    });

    await taskRepo.save({
      stage_id: stage1.id,
      task_text: 'seeded task',
      name: 'seeded task',
      is_complete: true,
      completed_at: new Date(),
      position: 1,
      status: 'complete',
    });

    // Output IDs for the tester
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ funnelId: funnel.id, stage1Id: stage1.id, stage2Id: stage2.id }, null, 2));

    await dataSource.destroy();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Seed script failed', err);
    try {
      await dataSource.destroy();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  }
})();
