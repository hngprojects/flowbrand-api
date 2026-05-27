import { MigrationInterface, QueryRunner } from "typeorm";

export class StageFeedback1779909612647 implements MigrationInterface {
    name = 'StageFeedback1779909612647'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "stage_feedback" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "funnel_id" uuid NOT NULL, "stage_id" uuid NOT NULL, "comment" text, CONSTRAINT "UQ_020d865245c049e16b2b716b383" UNIQUE ("user_id", "stage_id"), CONSTRAINT "PK_0f6c9a742ede4478aff9a54eee5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3b7d74ac49175d6ed1b5dacf74" ON "stage_feedback" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0ccea44bef56c6bcf24e8b4a4b" ON "stage_feedback" ("funnel_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b9337e2ba8b214714361b2eee2" ON "stage_feedback" ("stage_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b9337e2ba8b214714361b2eee2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0ccea44bef56c6bcf24e8b4a4b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b7d74ac49175d6ed1b5dacf74"`);
        await queryRunner.query(`DROP TABLE "stage_feedback"`);
    }

}
