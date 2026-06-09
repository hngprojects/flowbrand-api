import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminNotificationPreferences1780737043609 implements MigrationInterface {
  name = 'AdminNotificationPreferences1780737043609';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_notification_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "general_notifications" boolean NOT NULL DEFAULT true, "push_email" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_admin_notification_preferences_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_admin_notification_preferences_user_id" ON "admin_notification_preferences" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_notification_preferences" ADD CONSTRAINT "FK_admin_notification_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_notification_preferences" DROP CONSTRAINT "FK_admin_notification_preferences_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_notification_preferences_user_id"`);
    await queryRunner.query(`DROP TABLE "admin_notification_preferences"`);
  }
}
