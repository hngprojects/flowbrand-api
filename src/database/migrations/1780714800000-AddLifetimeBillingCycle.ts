import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifetimeBillingCycle1780714800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE subscriptions_billing_cycle_enum ADD VALUE IF NOT EXISTS 'lifetime'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values — rollback requires recreating the type
  }
}
