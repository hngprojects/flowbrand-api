import { MigrationInterface, QueryRunner } from "typeorm";

export class FunnelDisplay1779196170533 implements MigrationInterface {
    name = 'FunnelDisplay1779196170533'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" ADD "business_name" character varying(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "funnels" ADD "creation_path" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "funnel_stages" ADD "completed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "name" character varying(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "position" integer NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."stage_tasks_status_enum" AS ENUM('pending', 'complete')`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "status" "public"."stage_tasks_status_enum" NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`CREATE INDEX "IDX_42f8131afe67c8c2de95b3b242" ON "stage_tasks" ("position") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_42f8131afe67c8c2de95b3b242"`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."stage_tasks_status_enum"`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" DROP COLUMN "position"`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "funnel_stages" DROP COLUMN "completed_at"`);
        await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "creation_path"`);
        await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "business_name"`);
    }

}
