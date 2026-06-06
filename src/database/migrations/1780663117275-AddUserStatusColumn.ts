import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserStatusColumn1780663117275 implements MigrationInterface {
    name = 'AddUserStatusColumn1780663117275'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification_preferences" DROP CONSTRAINT IF EXISTS "FK_notification_preferences_user_id"`);
        await queryRunner.query(`ALTER TABLE "admin_notifications" DROP CONSTRAINT IF EXISTS "FK_admin_notifications_admin_id"`);
        await queryRunner.query(`ALTER TABLE "activity_events" DROP CONSTRAINT IF EXISTS "FK_activity_events_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_notification_preferences_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_admin_notifications_admin_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_admin_notifications_risk_admin_stage"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_events_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_activity_events_event_type"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_plan_check"`);
        await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'suspended', 'deleted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_64c90edc7310c6be7c10c96f67" ON "notification_preferences" ("user_id") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_c07cffb34f4e05a78f7663bc61" ON "admin_notifications" ("admin_id") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_6b7520c53f24fe26f14807e811" ON "activity_events" ("user_id") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_c3c59635fd9b8dc3beecd07ca8" ON "activity_events" ("event_type") `);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_64c90edc7310c6be7c10c96f675" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "admin_notifications" ADD CONSTRAINT "FK_c07cffb34f4e05a78f7663bc611" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "activity_events" ADD CONSTRAINT "FK_6b7520c53f24fe26f14807e811d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity_events" DROP CONSTRAINT "FK_6b7520c53f24fe26f14807e811d"`);
        await queryRunner.query(`ALTER TABLE "admin_notifications" DROP CONSTRAINT "FK_c07cffb34f4e05a78f7663bc611"`);
        await queryRunner.query(`ALTER TABLE "notification_preferences" DROP CONSTRAINT "FK_64c90edc7310c6be7c10c96f675"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c3c59635fd9b8dc3beecd07ca8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b7520c53f24fe26f14807e811"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c07cffb34f4e05a78f7663bc61"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_64c90edc7310c6be7c10c96f67"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "users_plan_check" CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'pro'::character varying])::text[])))`);
        await queryRunner.query(`CREATE INDEX "IDX_activity_events_event_type" ON "activity_events" ("event_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_activity_events_user_id" ON "activity_events" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_admin_notifications_risk_admin_stage" ON "admin_notifications" ("admin_id") WHERE (type = 'risk'::admin_notifications_type_enum)`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_notifications_admin_id" ON "admin_notifications" ("admin_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_notification_preferences_user_id" ON "notification_preferences" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "activity_events" ADD CONSTRAINT "FK_activity_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_notifications" ADD CONSTRAINT "FK_admin_notifications_admin_id" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_notification_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
