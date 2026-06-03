import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminTeamsTables1780510471940 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // ── admin_teams ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "public"."admin_teams_status_enum" AS ENUM('active', 'deleted')`,
    );
    await queryRunner.query(`
      CREATE TABLE "admin_teams" (
        "id"          uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name"        character varying(100) NOT NULL,
        "description" text,
        "status"      "public"."admin_teams_status_enum" NOT NULL DEFAULT 'active',
        "created_by"  uuid                NOT NULL,
        CONSTRAINT "PK_admin_teams" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_teams"
        ADD CONSTRAINT "FK_admin_teams_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
 
    // ── team_memberships ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "team_memberships" (
        "id"         uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "team_id"    uuid                NOT NULL,
        "user_id"    uuid                NOT NULL,
        "role"       character varying(20) NOT NULL DEFAULT 'member',
        "joined_at"  TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_team_memberships" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_team_memberships_team_user"
        ON "team_memberships" ("team_id", "user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "team_memberships"
        ADD CONSTRAINT "FK_team_memberships_team"
        FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "team_memberships"
        ADD CONSTRAINT "FK_team_memberships_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
 
    // ── team_invitations ─────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "public"."team_invitations_status_enum" AS ENUM('pending', 'accepted', 'revoked')`,
    );
    await queryRunner.query(`
      CREATE TABLE "team_invitations" (
        "id"          uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "team_id"     uuid                NOT NULL,
        "email"       character varying(255) NOT NULL,
        "role"        character varying(20) NOT NULL,
        "invited_by"  uuid                NOT NULL,
        "token_hash"  text                NOT NULL,
        "status"      "public"."team_invitations_status_enum" NOT NULL DEFAULT 'pending',
        "expires_at"  TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_team_invitations" PRIMARY KEY ("id")
      )
    `);
    // Partial unique index — one pending invite per email per team (FR-2)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_team_invitations_team_email_pending"
        ON "team_invitations" ("team_id", "email")
        WHERE "status" = 'pending'
    `);
    await queryRunner.query(`
      ALTER TABLE "team_invitations"
        ADD CONSTRAINT "FK_team_invitations_team"
        FOREIGN KEY ("team_id") REFERENCES "admin_teams"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "team_invitations"
        ADD CONSTRAINT "FK_team_invitations_invited_by"
        FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }
 
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_team_invitations_invited_by"`);
    await queryRunner.query(`ALTER TABLE "team_invitations" DROP CONSTRAINT "FK_team_invitations_team"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_team_invitations_team_email_pending"`);
    await queryRunner.query(`DROP TABLE "team_invitations"`);
    await queryRunner.query(`DROP TYPE "public"."team_invitations_status_enum"`);
 
    await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_team_memberships_user"`);
    await queryRunner.query(`ALTER TABLE "team_memberships" DROP CONSTRAINT "FK_team_memberships_team"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_team_memberships_team_user"`);
    await queryRunner.query(`DROP TABLE "team_memberships"`);
 
    await queryRunner.query(`ALTER TABLE "admin_teams" DROP CONSTRAINT "FK_admin_teams_created_by"`);
    await queryRunner.query(`DROP TABLE "admin_teams"`);
    await queryRunner.query(`DROP TYPE "public"."admin_teams_status_enum"`);
  }

}
