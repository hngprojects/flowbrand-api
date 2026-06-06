import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePaymentTables1780524813543 implements MigrationInterface {
    name = 'CreatePaymentTables1780524813543'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_plan_enum" AS ENUM('pro')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_billing_cycle_enum" AS ENUM('monthly', 'annual')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('pending', 'active', 'cancelled', 'expired')`);
        await queryRunner.query(`CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "plan" "public"."subscriptions_plan_enum" NOT NULL, "billing_cycle" "public"."subscriptions_billing_cycle_enum" NOT NULL, "status" "public"."subscriptions_status_enum" NOT NULL DEFAULT 'pending', "provider_customer_code" character varying, "provider_subscription_code" character varying, "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL, "cancel_at_period_end" boolean NOT NULL DEFAULT false, "cancelled_at" TIMESTAMP WITH TIME ZONE, "ended_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_subscriptions_active_user" ON "subscriptions" ("user_id") WHERE "status" IN ('pending', 'active')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_payment_type_enum" AS ENUM('one_time', 'subscription')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_plan_enum" AS ENUM('pro')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'success', 'failed', 'refunded')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_provider_enum" AS ENUM('mock', 'paystack', 'flutterwave', 'stripe')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "subscription_id" uuid, "payment_type" "public"."payments_payment_type_enum" NOT NULL, "plan" "public"."payments_plan_enum" NOT NULL, "amount_kobo" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "provider_reference" character varying, "provider" "public"."payments_provider_enum" NOT NULL, "idempotency_key" character varying NOT NULL, "card_last4" character varying(4), "card_brand" character varying, "failure_reason" text, "paid_at" TIMESTAMP WITH TIME ZONE, "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_payments_idempotency_key" ON "payments" ("idempotency_key") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_payments_provider_reference" ON "payments" ("provider_reference") WHERE "provider_reference" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_payments_user_id" ON "payments" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_427785468fb7d2733f59e7d7d39" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_75848dfef07fd19027e08ca81d2" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_75848dfef07fd19027e08ca81d2"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_427785468fb7d2733f59e7d7d39"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_provider_reference"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_idempotency_key"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_provider_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_plan_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_payment_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_subscriptions_active_user"`);
        await queryRunner.query(`DROP TABLE "subscriptions"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_billing_cycle_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_plan_enum"`);
    }

}
