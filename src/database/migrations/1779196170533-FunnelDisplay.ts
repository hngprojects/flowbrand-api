import { MigrationInterface, QueryRunner } from "typeorm";

export class FunnelDisplay1779196170533 implements MigrationInterface {
    name = 'FunnelDisplay1779196170533'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" ADD "business_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "funnels" ADD "creation_path" character varying(100)`);
        await queryRunner.query(
            `UPDATE "funnels" SET "business_name" = COALESCE(NULLIF("business_name", ''), 'My Business') WHERE "business_name" IS NULL OR "business_name" = ''`
        );
        await queryRunner.query(
            `UPDATE "funnels" SET "creation_path" = COALESCE(NULLIF("creation_path", ''), 'wizard') WHERE "creation_path" IS NULL OR "creation_path" = ''`
        );
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "business_name" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "creation_path" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "funnel_stages" ADD "completed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(
            `UPDATE "funnel_stages" SET "completed_at" = COALESCE("completed_at", "updated_at") WHERE "completed_at" IS NULL AND "status" = 'complete'`
        );

        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "position" integer`);
        await queryRunner.query(
            `UPDATE "stage_tasks" st SET "name" = COALESCE(NULLIF(st."name", ''), NULLIF(st."task_text", ''), 'Task')`
        );
        await queryRunner.query(
            `WITH ordered_tasks AS (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY "stage_id" ORDER BY "created_at", id) AS rn
                FROM "stage_tasks"
            )
            UPDATE "stage_tasks" st
            SET "position" = ordered_tasks.rn
            FROM ordered_tasks
            WHERE st.id = ordered_tasks.id`
        );
        await queryRunner.query(`ALTER TABLE "stage_tasks" ALTER COLUMN "name" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ALTER COLUMN "position" SET NOT NULL`);

        await queryRunner.query(`CREATE TYPE "public"."stage_tasks_status_enum" AS ENUM('pending', 'complete')`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ADD "status" "public"."stage_tasks_status_enum"`);
        await queryRunner.query(
            `UPDATE "stage_tasks" SET "status" = CASE WHEN COALESCE("is_complete", false) = true OR "completed_at" IS NOT NULL THEN 'complete' ELSE 'pending' END`
        );
        await queryRunner.query(`ALTER TABLE "stage_tasks" ALTER COLUMN "status" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "stage_tasks" ALTER COLUMN "status" SET DEFAULT 'pending'`);
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
