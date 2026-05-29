import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationPreferences1780003000000 implements MigrationInterface {
  name = 'NotificationPreferences1780003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "email_funnel_ready" boolean NOT NULL DEFAULT true, "email_stage_unlocked" boolean NOT NULL DEFAULT true, "email_stage_completed" boolean NOT NULL DEFAULT false, "email_weekly_digest" boolean NOT NULL DEFAULT true, "inapp_task_completed" boolean NOT NULL DEFAULT true, "inapp_stage_unlocked" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_notification_preferences_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notification_preferences_user_id" ON "notification_preferences" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_notification_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" DROP CONSTRAINT "FK_notification_preferences_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_preferences_user_id"`);
    await queryRunner.query(`DROP TABLE "notification_preferences"`);
  }
}
