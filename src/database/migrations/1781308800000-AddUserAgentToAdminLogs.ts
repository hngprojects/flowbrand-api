import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the raw User-Agent capture column to admin_logs. The value is parsed into
 * a "Browser Major · OS Version" device label on read; storing it raw lets the
 * parser improve later without a backfill. Nullable: non-HTTP actions and older
 * rows have no user agent. varchar(512) comfortably fits real-world UA strings.
 */
export class AddUserAgentToAdminLogs1781308800000 implements MigrationInterface {
  name = 'AddUserAgentToAdminLogs1781308800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_logs" ADD COLUMN IF NOT EXISTS "user_agent" character varying(512)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_logs" DROP COLUMN IF EXISTS "user_agent"`);
  }
}
