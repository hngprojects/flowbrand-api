import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameFunnelBusinessNameToFunnelName1780548836812 implements MigrationInterface {
    name = 'RenameFunnelBusinessNameToFunnelName1780548836812'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" RENAME COLUMN "business_name" TO "funnel_name"`);
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "funnel_name" SET DEFAULT 'My Funnel'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "funnel_name" SET DEFAULT 'My Business'`);
        await queryRunner.query(`ALTER TABLE "funnels" RENAME COLUMN "funnel_name" TO "business_name"`);
    }

}
