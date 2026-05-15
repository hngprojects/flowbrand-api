import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddUserSessionsAndTermsAccepted1779000001000
  implements MigrationInterface
{
  name = 'AddUserSessionsAndTermsAccepted1779000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add terms_accepted column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'terms_accepted',
        type: 'boolean',
        default: false,
        isNullable: false,
      })
    );

    // Create user_sessions table
    await queryRunner.createTable(
      new Table({
        name: 'user_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'refreshToken',
            type: 'text',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'isRevoked',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'revokedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Create index on userId
    await queryRunner.createIndex(
      'user_sessions',
      new TableIndex({
        name: 'IDX_user_sessions_userId',
        columnNames: ['userId'],
      })
    );

    // Create foreign key constraint
    await queryRunner.createForeignKey(
      'user_sessions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const userSessionsTable = await queryRunner.getTable('user_sessions');
    const userFk = userSessionsTable?.foreignKeys.find((fk) =>
      fk.columnNames.includes('userId')
    );
    if (userFk) {
      await queryRunner.dropForeignKey('user_sessions', userFk);
    }

    // Drop index
    await queryRunner.dropIndex('user_sessions', 'IDX_user_sessions_userId');

    // Drop table
    await queryRunner.dropTable('user_sessions');

    // Remove terms_accepted column
    await queryRunner.dropColumn('users', 'terms_accepted');
  }
}
