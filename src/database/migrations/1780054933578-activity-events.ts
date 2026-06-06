import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActivityEvents1780054933578 implements MigrationInterface {
  name = 'ActivityEvents1780054933578';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "activity_events" ` +
        `("id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"user_id" uuid NOT NULL, ` +
        `"event_type" character varying(50) NOT NULL, ` +
        `"funnel_id" uuid, ` +
        `"stage_id" uuid, ` +
        `"task_id" uuid, ` +
        `"metadata" jsonb NOT NULL DEFAULT '{}', ` +
        `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_activity_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_events_user_id" ON "activity_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_events_event_type" ON "activity_events" ("event_type")`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_events" ADD CONSTRAINT "FK_activity_events_user_id" ` +
        `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_events" DROP CONSTRAINT IF EXISTS "FK_activity_events_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_events_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_events_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_events"`);
  }
}
