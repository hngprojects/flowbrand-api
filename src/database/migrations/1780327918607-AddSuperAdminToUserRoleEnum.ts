import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuperAdminToUserRoleEnum1780327918607 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."user_roles_role_enum" ADD VALUE IF NOT EXISTS 'super_admin'`);
  }

  // ALTER TYPE ... ADD VALUE cannot be reversed in Postgres without recreating
  // the enum. This migration is intentionally forward-only.
  public async down(): Promise<void> {}
}
