import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseUserColumnSizes1779289904856 implements MigrationInterface {
    name = 'IncreaseUserColumnSizes1779289904856'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "business_type"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "business_type" text`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "primary_goal"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "primary_goal" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "business_name" SET DEFAULT 'My Business'`);
        await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "creation_path"`);
        await queryRunner.query(`ALTER TABLE "funnels" ADD "creation_path" "public"."funnels_creation_path_enum" NOT NULL DEFAULT 'wizard'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "creation_path"`);
        await queryRunner.query(`ALTER TABLE "funnels" ADD "creation_path" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "funnels" ALTER COLUMN "business_name" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "primary_goal"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "primary_goal" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "business_type"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "business_type" character varying(100)`);
    }

}
