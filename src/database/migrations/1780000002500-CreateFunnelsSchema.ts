import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateFunnelsSchema1780000002500 implements MigrationInterface {
  name = 'CreateFunnelsSchema1780000002500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "funnel_status_enum" AS ENUM ('generating', 'active', 'complete')`);
    await queryRunner.query(`CREATE TYPE "funnel_stage_status_enum" AS ENUM ('locked', 'active', 'complete')`);
    await queryRunner.query(`CREATE TYPE "stage_task_status_enum" AS ENUM ('pending', 'complete')`);

    await queryRunner.createTable(
      new Table({
        name: 'funnels',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'business_name', type: 'varchar', length: '255', isNullable: false },
          { name: 'creation_path', type: 'varchar', length: '100', isNullable: false },
          { name: 'status', type: 'funnel_status_enum', default: `'generating'`, isNullable: false },
        ],
      }),
    );

    await queryRunner.createIndex(
      'funnels',
      new TableIndex({ name: 'IDX_funnels_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createForeignKey(
      'funnels',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'funnel_stages',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'funnel_id', type: 'uuid', isNullable: false },
          { name: 'position', type: 'int', isNullable: false },
          { name: 'name', type: 'varchar', length: '120', isNullable: false },
          { name: 'channel', type: 'varchar', length: '60', isNullable: true },
          { name: 'status', type: 'funnel_stage_status_enum', default: `'locked'`, isNullable: false },
          { name: 'explanation', type: 'text', isNullable: true },
          { name: 'action_prompt', type: 'text', isNullable: true },
          { name: 'unlocked_at', type: 'timestamp with time zone', isNullable: true },
          { name: 'completed_at', type: 'timestamp with time zone', isNullable: true },
        ],
      }),
    );

    await queryRunner.createIndex(
      'funnel_stages',
      new TableIndex({ name: 'IDX_funnel_stages_funnel_id', columnNames: ['funnel_id'] }),
    );

    await queryRunner.createIndex(
      'funnel_stages',
      new TableIndex({ name: 'IDX_funnel_stages_position', columnNames: ['position'] }),
    );

    await queryRunner.createForeignKey(
      'funnel_stages',
      new TableForeignKey({
        columnNames: ['funnel_id'],
        referencedTableName: 'funnels',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'stage_tasks',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'stage_id', type: 'uuid', isNullable: false },
          { name: 'position', type: 'int', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'status', type: 'stage_task_status_enum', default: `'pending'`, isNullable: false },
        ],
      }),
    );

    await queryRunner.createIndex(
      'stage_tasks',
      new TableIndex({ name: 'IDX_stage_tasks_stage_id', columnNames: ['stage_id'] }),
    );

    await queryRunner.createIndex(
      'stage_tasks',
      new TableIndex({ name: 'IDX_stage_tasks_position', columnNames: ['position'] }),
    );

    await queryRunner.createForeignKey(
      'stage_tasks',
      new TableForeignKey({
        columnNames: ['stage_id'],
        referencedTableName: 'funnel_stages',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('stage_tasks');
    await queryRunner.dropTable('funnel_stages');
    await queryRunner.dropTable('funnels');
    await queryRunner.query(`DROP TYPE IF EXISTS "stage_task_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "funnel_stage_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "funnel_status_enum"`);
  }
}
