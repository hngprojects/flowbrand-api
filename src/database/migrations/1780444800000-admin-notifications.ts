import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminNotifications1780444800000 implements MigrationInterface {
    name = 'AdminNotifications1780444800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."admin_notifications_type_enum" AS ENUM('mention', 'risk', 'milestone', 'feedback')`);
        await queryRunner.query(`CREATE TABLE "admin_notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "admin_id" uuid NOT NULL, "type" "public"."admin_notifications_type_enum" NOT NULL, "title" character varying(120) NOT NULL, "message" text NOT NULL, "sender_name" character varying(100), "sender_avatar_url" text, "is_read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP WITH TIME ZONE, "is_starred" boolean NOT NULL DEFAULT false, "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_admin_notifications_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_notifications_admin_id" ON "admin_notifications" ("admin_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_notifications_admin_id_is_read" ON "admin_notifications" ("admin_id", "is_read")`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_notifications_admin_id_type" ON "admin_notifications" ("admin_id", "type")`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_notifications_admin_id_is_starred" ON "admin_notifications" ("admin_id", "is_starred")`);
        await queryRunner.query(`ALTER TABLE "admin_notifications" ADD CONSTRAINT "FK_admin_notifications_admin_id" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_notifications" DROP CONSTRAINT "FK_admin_notifications_admin_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_notifications_admin_id_is_starred"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_notifications_admin_id_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_notifications_admin_id_is_read"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_notifications_admin_id"`);
        await queryRunner.query(`DROP TABLE "admin_notifications"`);
        await queryRunner.query(`DROP TYPE "public"."admin_notifications_type_enum"`);
    }

}
