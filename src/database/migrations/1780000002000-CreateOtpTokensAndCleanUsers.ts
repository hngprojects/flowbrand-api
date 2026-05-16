import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class CreateOtpTokensAndCleanUsers1780000002000 implements MigrationInterface {
  name = 'CreateOtpTokensAndCleanUsers1780000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "otp_token_type_enum" AS ENUM ('email_verification', 'password_reset')`);

    await queryRunner.createTable(
      new Table({
        name: 'otp_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'now()',
            isNullable: false,
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          {
            name: 'type',
            type: 'otp_token_type_enum',
            isNullable: false,
          },
          { name: 'token_hash', type: 'text', isNullable: false },
          {
            name: 'expires_at',
            type: 'timestamp with time zone',
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'otp_tokens',
      new TableIndex({
        name: 'IDX_otp_tokens_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'otp_tokens',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.dropColumn('users', 'otp_hash');
    await queryRunner.dropColumn('users', 'expires_at');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'expires_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'otp_hash',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    await queryRunner.dropTable('otp_tokens');
    await queryRunner.query(`DROP TYPE "otp_token_type_enum"`);
  }
}
