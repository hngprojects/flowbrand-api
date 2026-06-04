import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanToUsers1780617600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "plan" character varying(20) NOT NULL DEFAULT 'free'`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "users_plan_check" CHECK (plan IN ('free', 'pro'))`);
    await queryRunner.query(`ALTER TABLE "users" ADD "plan_activated_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_plan_check"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "plan_activated_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "plan"`);
  }
}
