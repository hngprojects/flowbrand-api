import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSourceTypeToUploadEntity1780950180322 implements MigrationInterface {
    name = 'AddSourceTypeToUploadEntity1780950180322'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_team_invitations_team"`);
        await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_team_invitations_invited_by"`);
        await queryRunner.query(`ALTER TABLE "admin_teams" DROP CONSTRAINT "FK_admin_teams_created_by"`);
        await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_team_memberships_team"`);
        await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_team_memberships_user"`);
        await queryRunner.query(`ALTER TABLE "admin_logs" DROP CONSTRAINT "FK_admin_logs_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_team_invitations_team_email_pending"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_team_memberships_team_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_logs_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_logs_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_logs_action_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_logs_status"`);
        await queryRunner.query(`CREATE TYPE "public"."uploaded_documents_source_type_enum" AS ENUM('document', 'voice')`);
        await queryRunner.query(`ALTER TABLE "uploaded_documents" ADD "source_type" "public"."uploaded_documents_source_type_enum" NOT NULL DEFAULT 'document'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b780a282603aaa80e05def2203" ON "team_invitations" ("team_id", "email") WHERE "status" = 'pending'`);
        await queryRunner.query(`CREATE INDEX "IDX_7ace7c4b3262abd89cb75ae53b" ON "admin_logs" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d2b22ec3e7c92f1e670f91a305" ON "admin_logs" ("action_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_d51744dc54aab8e69c2e3bb662" ON "admin_logs" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_c328cf8abb6bd5fabdd090d677" ON "admin_logs" ("created_at") `);
        await queryRunner.query(`ALTER TABLE "team_memberships" ADD CONSTRAINT "UQ_11c823f69a675c3f05d0fc31958" UNIQUE ("team_id", "user_id")`);
        await queryRunner.query(`ALTER TABLE "team_invitations" ADD CONSTRAINT "FK_47d9ff0726cf20571e29480a99b" FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_invitations" ADD CONSTRAINT "FK_92d21809e16a56887210bb4dbc5" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_teams" ADD CONSTRAINT "FK_5b12c080ebe16ac4bdaae422b58" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_memberships" ADD CONSTRAINT "FK_b917b8603c6d5c526fcdb2009de" FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_memberships" ADD CONSTRAINT "FK_c9eb2ded8e0e2f4bcb41fd0984a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_logs" ADD CONSTRAINT "FK_7ace7c4b3262abd89cb75ae53b1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_logs" DROP CONSTRAINT "FK_7ace7c4b3262abd89cb75ae53b1"`);
        await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_c9eb2ded8e0e2f4bcb41fd0984a"`);
        await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_b917b8603c6d5c526fcdb2009de"`);
        await queryRunner.query(`ALTER TABLE "admin_teams" DROP CONSTRAINT "FK_5b12c080ebe16ac4bdaae422b58"`);
        await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_92d21809e16a56887210bb4dbc5"`);
        await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_47d9ff0726cf20571e29480a99b"`);
        await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "UQ_11c823f69a675c3f05d0fc31958"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c328cf8abb6bd5fabdd090d677"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d51744dc54aab8e69c2e3bb662"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2b22ec3e7c92f1e670f91a305"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7ace7c4b3262abd89cb75ae53b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b780a282603aaa80e05def2203"`);
        await queryRunner.query(`ALTER TABLE "uploaded_documents" DROP COLUMN "source_type"`);
        await queryRunner.query(`DROP TYPE "public"."uploaded_documents_source_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_logs_status" ON "admin_logs" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_admin_logs_action_type" ON "admin_logs" ("action_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_admin_logs_user_id" ON "admin_logs" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_admin_logs_created_at" ON "admin_logs" ("created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_team_memberships_team_user" ON "team_memberships" ("team_id", "user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_team_invitations_team_email_pending" ON "team_invitations" ("email", "team_id") WHERE (status = 'pending'::team_invitations_status_enum)`);
        await queryRunner.query(`ALTER TABLE "admin_logs" ADD CONSTRAINT "FK_admin_logs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_memberships" ADD CONSTRAINT "FK_team_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_memberships" ADD CONSTRAINT "FK_team_memberships_team" FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_teams" ADD CONSTRAINT "FK_admin_teams_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_invitations" ADD CONSTRAINT "FK_team_invitations_invited_by" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "team_invitations" ADD CONSTRAINT "FK_team_invitations_team" FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
