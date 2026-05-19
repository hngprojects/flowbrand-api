import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-305 adds two columns and one composite index to the funnels table:
 *
 *   - business_name  (varchar 255, default 'My Business')
 *   - creation_path  (enum wizard | document_upload, default 'wizard')
 *   - IDX_funnels_user_id_status  (user_id, status) for the concurrent
 *     generation check at POST /funnels/generate.
 */
export class AddFunnelGenerationFields1779208748587 implements MigrationInterface {
  name = 'AddFunnelGenerationFields1779208748587';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."funnels_creation_path_enum" AS ENUM('wizard', 'document_upload')`,
    );

    await queryRunner.query(
      `ALTER TABLE "funnels" ADD COLUMN "business_name" varchar(255) NOT NULL DEFAULT 'My Business'`,
    );

    await queryRunner.query(
      `ALTER TABLE "funnels" ADD COLUMN "creation_path" "public"."funnels_creation_path_enum" NOT NULL DEFAULT 'wizard'`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_funnels_user_id_status" ON "funnels" ("user_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_funnels_user_id_status"`);
    await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "creation_path"`);
    await queryRunner.query(`ALTER TABLE "funnels" DROP COLUMN "business_name"`);
    await queryRunner.query(`DROP TYPE "public"."funnels_creation_path_enum"`);
  }
}
