import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class InitAuthAndOnboardingSchema1780000000000
  implements MigrationInterface
{
  name = 'InitAuthAndOnboardingSchema1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "user_role_enum" AS ENUM ('user', 'admin');
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'full_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'email', type: 'varchar', length: '255', isUnique: true, isNullable: false },
          { name: 'password_hash', type: 'text', isNullable: true },
          { name: 'country', type: 'varchar', length: '100', isNullable: true },
          { name: 'is_verified', type: 'boolean', default: false, isNullable: false },
          { name: 'is_active', type: 'boolean', default: true, isNullable: false },
          { name: 'avatar_url', type: 'text', isNullable: true },
          { name: 'auth_provider', type: 'varchar', length: '20', default: `'local'`, isNullable: false },
          { name: 'provider_user_id', type: 'text', isNullable: true },
          { name: 'otp_hash', type: 'varchar', length: '255', isNullable: true },
          { name: 'expires_at', type: 'timestamp with time zone', isNullable: true },
          { name: 'terms_accepted', type: 'boolean', default: false, isNullable: false },
          { name: 'deleted_at', type: 'timestamp with time zone', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_email', columnNames: ['email'], isUnique: true }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'role', type: 'user_role_enum', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({ name: 'IDX_user_roles_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_user_roles_user_id_role',
        columnNames: ['user_id', 'role'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'user_sessions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'refresh_token', type: 'text', isNullable: false },
          { name: 'expires_at', type: 'timestamp with time zone', isNullable: false },
          { name: 'is_revoked', type: 'boolean', default: false, isNullable: false },
          { name: 'revoked_at', type: 'timestamp with time zone', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'user_sessions',
      new TableIndex({ name: 'IDX_user_sessions_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createForeignKey(
      'user_sessions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'auth_metadata',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'locked_until', type: 'timestamp with time zone', isNullable: true },
          { name: 'failed_attempts', type: 'int', default: 0, isNullable: false },
          { name: 'last_login_at', type: 'timestamp with time zone', isNullable: true },
          { name: 'password_changed_at', type: 'timestamp with time zone', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'auth_metadata',
      new TableIndex({
        name: 'IDX_auth_metadata_user_id',
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'auth_metadata',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "wizard_status_enum" AS ENUM ('in_progress', 'complete', 'expired');
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'wizard_sessions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'status', type: 'wizard_status_enum', default: `'in_progress'`, isNullable: false },
          { name: 'steps_completed', type: 'int', default: 0, isNullable: false },
          { name: 'answers', type: 'jsonb', default: `'{}'`, isNullable: false },
          { name: 'expires_at', type: 'timestamp with time zone', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'wizard_sessions',
      new TableIndex({ name: 'IDX_wizard_sessions_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createForeignKey(
      'wizard_sessions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('wizard_sessions');
    await queryRunner.dropTable('auth_metadata');
    await queryRunner.dropTable('user_sessions');
    await queryRunner.dropTable('user_roles');
    await queryRunner.dropTable('users');
    await queryRunner.query(`DROP TYPE IF EXISTS "wizard_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
  }
}
