import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUploadedDocuments1779191211735 implements MigrationInterface {
    name = 'AddUploadedDocuments1779191211735'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."uploaded_documents_status_enum" AS ENUM('uploading', 'parsing', 'ready', 'failed')`);
        await queryRunner.query(`CREATE TABLE "uploaded_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP 
        await queryRunner.query(`CREATE INDEX "IDX_b5423d1e7ccd9ff75ff3be1cc7" ON "uploaded_documents" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "uploaded_documents" ADD CONSTRAINT "FK_b5423d1e7ccd9ff75ff3be1cc78" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "uploaded_documents" DROP CONSTRAINT "FK_b5423d1e7ccd9ff75ff3be1cc78"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b5423d1e7ccd9ff75ff3be1cc7"`);
        await queryRunner.query(`DROP TABLE "uploaded_documents"`);
        await queryRunner.query(`DROP TYPE "public"."uploaded_documents_status_enum"`);
    }

}
