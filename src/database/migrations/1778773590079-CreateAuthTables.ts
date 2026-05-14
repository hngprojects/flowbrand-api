import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthTables1778773590079 implements MigrationInterface {
    name = 'CreateAuthTables1778773590079'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_472b25323af01488f1f66a06b67"`);
        await queryRunner.query(`ALTER TABLE "user_sessions" DROP CONSTRAINT "FK_55fa4db8406ed66bc7044328427"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" DROP CONSTRAINT "FK_2a2b402c9d51916e8f16a8ceb5e"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "user_sessions" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_sessions" ADD CONSTRAINT "FK_e9658e959c490b0a634dfc54783" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ADD CONSTRAINT "FK_2560089aa51d19bdd5e520a6822" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wizard_sessions" DROP CONSTRAINT "FK_2560089aa51d19bdd5e520a6822"`);
        await queryRunner.query(`ALTER TABLE "user_sessions" DROP CONSTRAINT "FK_e9658e959c490b0a634dfc54783"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "user_sessions" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "wizard_sessions" ADD CONSTRAINT "FK_2a2b402c9d51916e8f16a8ceb5e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_sessions" ADD CONSTRAINT "FK_55fa4db8406ed66bc7044328427" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_472b25323af01488f1f66a06b67" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
