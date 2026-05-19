import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFunnelTables1779086091363 implements MigrationInterface {
    name = 'CreateFunnelTables1779086091363'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_user_id_role"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_auth_metadata_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_sessions_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_otp_tokens_user_id"`);
        await queryRunner.query(`CREATE TYPE "public"."wizard_sessions_status_enum" AS ENUM('in_progress', 'complete', 'expired')`);
        await queryRunner.query(`CREATE TABLE "wizard_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WIT
        await queryRunner.query(`CREATE INDEX "IDX_2560089aa51d19bdd5e520a682" ON "wizard_sessions" ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."funnels_status_enum" AS ENUM('generating', 'active', 'failed')`);
        await queryRunner.query(`CREATE TABLE "funnels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME Z
        await queryRunner.query(`CREATE INDEX "IDX_ffebdbbcff0d565c11f11ef416" ON "funnels" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97a0c9cc87a9ffe45bdb46456f" ON "funnels" ("idempotency_key") `);
        await queryRunner.query(`CREATE TYPE "public"."funnel_stages_status_enum" AS ENUM('locked', 'active', 'complete')`);
        await queryRunner.query(`CREATE TABLE "funnel_stages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH 
        await queryRunner.query(`CREATE INDEX "IDX_142b9b0473faf7fd4d4f4da2d0" ON "funnel_stages" ("funnel_id") `);
        await queryRunner.query(`CREATE TABLE "stage_tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TI
        await queryRunner.query(`CREATE INDEX "IDX_facb1a996194dc40dfd64b301e" ON "stage_tasks" ("stage_id") `);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum" RENAME TO "user_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."user_roles_role_enum" AS ENUM('user', 'admin')`);
        await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "public"."user_roles_role_enum" USING "role"::"text"::"public"."user_roles_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "FK_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "UQ_ddd81470f2c5703341629008c83" UNIQUE ("user_id")`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`ALTER TYPE "public"."otp_token_type_enum" RENAME TO "otp_token_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."otp_tokens_type_enum" AS ENUM('email_verification', 'password_reset')`);
        await queryRunner.query(`ALTER TABLE "otp_tokens" ALTER COLUMN "type" TYPE "public"."otp_tokens_type_enum" USING "type"::"text"::"public"."otp_tokens_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."otp_token_type_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09d115a69b6014d324d592f9c4" ON "user_roles" ("user_id", "role") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd81470f2c5703341629008c8" ON "auth_metadata" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_7003728e208144a06a974b2dbe" ON "otp_tokens" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "FK_ddd81470f2c5703341629008c83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ADD CONSTRAINT "FK_2560089aa51d19bdd5e520a6822" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "funnels" ADD CONSTRAINT "FK_ffebdbbcff0d565c11f11ef416e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "funnel_stages" ADD CONSTRAINT "FK_142b9b0473faf7fd4d4f4da2d0b" FOREIGN KEY ("funnel_id") REFERENCES "funnels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD CONSTRAINT "FK_facb1a996194dc40dfd64b301e9" FOREIGN KEY ("stage_id") REFERENCES "funnel_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTI
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stage_tasks" DROP CONSTRAINT "FK_facb1a996194dc40dfd64b301e9"`);
        await queryRunner.query(`ALTER TABLE "funnel_stages" DROP CONSTRAINT "FK_142b9b0473faf7fd4d4f4da2d0b"`);
        await queryRunner.query(`ALTER TABLE "funnels" DROP CONSTRAINT "FK_ffebdbbcff0d565c11f11ef416e"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" DROP CONSTRAINT "FK_2560089aa51d19bdd5e520a6822"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "FK_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7003728e208144a06a974b2dbe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9658e959c490b0a634dfc5478"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd81470f2c5703341629008c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09d115a69b6014d324d592f9c4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87b8888186ca9769c960e92687"`);
        await queryRunner.query(`CREATE TYPE "public"."otp_token_type_enum_old" AS ENUM('email_verification', 'password_reset')`);
        await queryRunner.query(`ALTER TABLE "otp_tokens" ALTER COLUMN "type" TYPE "public"."otp_token_type_enum_old" USING "type"::"text"::"public"."otp_token_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."otp_tokens_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."otp_token_type_enum_old" RENAME TO "otp_token_type_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "UQ_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "FK_ddd81470f2c5703341629008c83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum_old" AS ENUM('user', 'admin')`);
        await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "public"."user_role_enum_old" USING "role"::"text"::"public"."user_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."user_roles_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum_old" RENAME TO "user_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_facb1a996194dc40dfd64b301e"`);
        await queryRunner.query(`DROP TABLE "stage_tasks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_142b9b0473faf7fd4d4f4da2d0"`);
        await queryRunner.query(`DROP TABLE "funnel_stages"`);
        await queryRunner.query(`DROP TYPE "public"."funnel_stages_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97a0c9cc87a9ffe45bdb46456f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ffebdbbcff0d565c11f11ef416"`);
        await queryRunner.query(`DROP TABLE "funnels"`);
        await queryRunner.query(`DROP TYPE "public"."funnels_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2560089aa51d19bdd5e520a682"`);
        await queryRunner.query(`DROP TABLE "wizard_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."wizard_sessions_status_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_otp_tokens_user_id" ON "otp_tokens" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_sessions_user_id" ON "user_sessions" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_auth_metadata_user_id" ON "auth_metadata" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_roles_user_id_role" ON "user_roles" ("user_id", "role") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_roles_user_id" ON "user_roles" ("user_id") `);
    }

}
