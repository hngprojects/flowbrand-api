import { MigrationInterface, QueryRunner } from "typeorm";

export class FunnelCompositeIdempotencyIndex1779415197875 implements MigrationInterface {
    name = 'FunnelCompositeIdempotencyIndex1779415197875'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_97a0c9cc87a9ffe45bdb46456f"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_funnels_user_idempotency" ON "funnels" ("user_id", "idempotency_key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_funnels_user_idempotency"`);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "funnels"
                    GROUP BY "idempotency_key"
                    HAVING COUNT(*) > 1
                ) THEN
                    RAISE EXCEPTION 'Rollback blocked: duplicate idempotency_key values exist across users — restore the composite index manually or deduplicate first';
                END IF;
            END $$;
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97a0c9cc87a9ffe45bdb46456f" ON "funnels" ("idempotency_key") `);
    }

}
