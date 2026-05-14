import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthTables1778757308852 implements MigrationInterface {
    name = 'CreateAuthTables1778757308852'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
        await queryRunner.query(`CREATE TYPE "public"."user_roles_role_enum" AS ENUM('user', 'admin')`);
        await queryRunner.query(`CREATE TABLE "user_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIM
        await queryRunner.query(`CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09d115a69b6014d324d592f9c4" ON "user_roles" ("user_id", "role") `);
        await queryRunner.query(`CREATE TABLE "auth_metadata" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH 
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd81470f2c5703341629008c8" ON "auth_metadata" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "user_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH 
        await queryRunner.query(`CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions" ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."wizard_sessions_status_enum" AS ENUM('in_progress', 'complete', 'expired')`);
        await queryRunner.query(`CREATE TABLE "wizard_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WIT
        await queryRunner.query(`CREATE INDEX "IDX_2560089aa51d19bdd5e520a682" ON "wizard_sessions" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "password_hash" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "country" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "is_verified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar_url" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "auth_provider" character varying(20) NOT NULL DEFAULT 'local'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "provider_user_id" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "otp_hash" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "terms_accepted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "expires_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "full_name" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_472b25323af01488f1f66a06b67" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" ADD CONSTRAINT "FK_ddd81470f2c5703341629008c83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_sessions" ADD CONSTRAINT "FK_55fa4db8406ed66bc7044328427" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ADD CONSTRAINT "FK_2a2b402c9d51916e8f16a8ceb5e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wizard_sessions" DROP CONSTRAINT "FK_2a2b402c9d51916e8f16a8ceb5e"`);
        await queryRunner.query(`ALTER TABLE "user_sessions" DROP CONSTRAINT "FK_55fa4db8406ed66bc7044328427"`);
        await queryRunner.query(`ALTER TABLE "auth_metadata" DROP CONSTRAINT "FK_ddd81470f2c5703341629008c83"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_472b25323af01488f1f66a06b67"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "full_name" character varying(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_accepted"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otp_hash"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider_user_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "auth_provider"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_verified"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "country"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_hash"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "refresh_token_hash" character varying(500)`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying(255) NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2560089aa51d19bdd5e520a682"`);
        await queryRunner.query(`DROP TABLE "wizard_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."wizard_sessions_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9658e959c490b0a634dfc5478"`);
        await queryRunner.query(`DROP TABLE "user_sessions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd81470f2c5703341629008c8"`);
        await queryRunner.query(`DROP TABLE "auth_metadata"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09d115a69b6014d324d592f9c4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87b8888186ca9769c960e92687"`);
        await queryRunner.query(`DROP TABLE "user_roles"`);
        await queryRunner.query(`DROP TYPE "public"."user_roles_role_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") `);
    }

}
