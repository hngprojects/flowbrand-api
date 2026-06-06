import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminLogs1780790400000 implements MigrationInterface {
  name = 'CreateAdminLogs1780790400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "admin_logs" ` +
        `("id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"user_id" uuid, ` +
        `"action_type" character varying(50) NOT NULL, ` +
        `"description" text NOT NULL, ` +
        `"ip_address" character varying(45), ` +
        `"status" character varying(10) NOT NULL, ` +
        `"metadata" jsonb NOT NULL DEFAULT '{}', ` +
        `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_admin_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_logs_created_at" ON "admin_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_logs_user_id" ON "admin_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_logs_action_type" ON "admin_logs" ("action_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_logs_status" ON "admin_logs" ("status")`,
    );
    // ADD CONSTRAINT has no IF NOT EXISTS; guard for idempotent re-runs.
    await queryRunner.query(
      `DO $$ BEGIN ` +
        `ALTER TABLE "admin_logs" ADD CONSTRAINT "FK_admin_logs_user_id" ` +
        `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION; ` +
        `EXCEPTION WHEN duplicate_object THEN NULL; ` +
        `END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_logs" DROP CONSTRAINT IF EXISTS "FK_admin_logs_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_admin_logs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_admin_logs_action_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_admin_logs_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_admin_logs_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_logs"`);
  }
}
