import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddOnboardingFieldsToUser1779014821998 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns('users', [
            new TableColumn({
                name: 'business_type',
                type: 'varchar',
                length: '100',
                isNullable: true,
            }),
            new TableColumn({
                name: 'target_customer',
                type: 'text',
                isNullable: true,
            }),
            new TableColumn({
                name: 'primary_goal',
                type: 'varchar',
                length: '50',
                isNullable: true,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumns('users', [
            'business_type',
            'target_customer',
            'primary_goal',
        ])
    }

}
