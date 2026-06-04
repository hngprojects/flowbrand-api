import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterFunnelBusinessNameText1780503398066 implements MigrationInterface {
    name = 'AlterFunnelBusinessNameText1780503398066'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "business_name" TYPE text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "business_name" TYPE character varying(255)`);
    }

}
