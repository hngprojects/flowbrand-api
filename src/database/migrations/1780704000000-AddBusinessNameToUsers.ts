import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessNameToUsers1780704000000 implements MigrationInterface {
  name = 'AddBusinessNameToUsers1780704000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "business_name" character varying(150)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "business_name"`);
  }
}
