import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddFunnelsPerformanceIndexes1780000003000 implements MigrationInterface {
  name = 'AddFunnelsPerformanceIndexes1780000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'funnels',
      new TableIndex({
        name: 'IDX_funnels_user_id_created_at',
        columnNames: ['user_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'funnel_stages',
      new TableIndex({
        name: 'IDX_funnel_stages_funnel_id_position',
        columnNames: ['funnel_id', 'position'],
      }),
    );

    await queryRunner.createIndex(
      'stage_tasks',
      new TableIndex({
        name: 'IDX_stage_tasks_stage_id_position',
        columnNames: ['stage_id', 'position'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('stage_tasks', 'IDX_stage_tasks_stage_id_position');
    await queryRunner.dropIndex('funnel_stages', 'IDX_funnel_stages_funnel_id_position');
    await queryRunner.dropIndex('funnels', 'IDX_funnels_user_id_created_at');
  }
}
