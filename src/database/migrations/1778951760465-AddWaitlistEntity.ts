import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWaitlistEntity1778951760465 implements MigrationInterface {
    name = 'AddWaitlistEntity1778951760465'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_user_id_role"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_auth_metadata_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_sessions_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_wizard_sessions_user_id"`);
        await queryRunner.query(`CREATE TABLE "waitlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2dcf9ba7fd147c0227c0f283e3" ON "waitlists" ("email") `);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum" RENAME TO "user_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."user_roles_role_enum" AS ENUM('user', 'admin')`);
        await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "public"."user_roles_role_enum" USING "role"::"text"::"public"."user_roles_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "FK_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "UQ_ddd81470f2c5703341629008c83" UNIQUE ("user_id")`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`ALTER TYPE "public"."wizard_status_enum" RENAME TO "wizard_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."wizard_sessions_status_enum" AS ENUM('in_progress', 'complete', 'expired')`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" TYPE "public"."wizard_sessions_status_enum" USING "status"::"text"::"public"."wizard_sessions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" SET DEFAULT 'in_progress'`);
        await queryRunner.query(`DROP TYPE "public"."wizard_status_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09d115a69b6014d324d592f9c4" ON "user_roles" ("user_id", "role") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd81470f2c5703341629008c8" ON "auth_metadata" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_2560089aa51d19bdd5e520a682" ON "wizard_sessions" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "FK_ddd81470f2c5703341629008c83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "FK_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2560089aa51d19bdd5e520a682"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9658e959c490b0a634dfc5478"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd81470f2c5703341629008c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09d115a69b6014d324d592f9c4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87b8888186ca9769c960e92687"`);
        await queryRunner.query(`CREATE TYPE "public"."wizard_status_enum_old" AS ENUM('in_progress', 'complete', 'expired')`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" TYPE "public"."wizard_status_enum_old" USING "status"::"text"::"public"."wizard_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ALTER COLUMN "status" SET DEFAULT 'in_progress'`);
        await queryRunner.query(`DROP TYPE "public"."wizard_sessions_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."wizard_status_enum_old" RENAME TO "wizard_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "UQ_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "FK_ddd81470f2c5703341629008c83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum_old" AS ENUM('user', 'admin')`);
        await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "public"."user_role_enum_old" USING "role"::"text"::"public"."user_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."user_roles_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum_old" RENAME TO "user_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2dcf9ba7fd147c0227c0f283e3"`);
        await queryRunner.query(`DROP TABLE "waitlists"`);
        await queryRunner.query(`CREATE INDEX "IDX_wizard_sessions_user_id" ON "wizard_sessions" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_sessions_user_id" ON "user_sessions" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_auth_metadata_user_id" ON "auth_metadata" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_roles_user_id" ON "user_roles" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_roles_user_id_role" ON "user_roles" ("user_id", "role") `);
    }

}
