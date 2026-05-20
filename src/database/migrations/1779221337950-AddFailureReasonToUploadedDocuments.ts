import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFailureReasonToUploadedDocuments1779221337950 implements MigrationInterface {
    name = 'AddFailureReasonToUploadedDocuments1779221337950'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "uploaded_documents" ADD "failure_reason" character varying(200)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "uploaded_documents" DROP COLUMN "failure_reason"`);
    }

}
