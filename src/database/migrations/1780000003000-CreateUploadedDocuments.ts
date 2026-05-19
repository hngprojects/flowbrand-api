import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateUploadedDocuments1780000003000
  implements MigrationInterface
{
  name = 'CreateUploadedDocuments1780000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "upload_document_status_enum" AS ENUM ('uploading', 'parsing', 'ready', 'failed')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'uploaded_documents',
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
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          { name: 'file_size_bytes', type: 'bigint', isNullable: false },
          {
            name: 'file_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'upload_document_status_enum',
            default: `'uploading'`,
            isNullable: false,
          },
          {
            name: 'percent_complete',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          { name: 'storage_path', type: 'text', isNullable: false },
          { name: 'parsed_text', type: 'text', isNullable: true },
        ],
      }),
    );

    await queryRunner.createIndex(
      'uploaded_documents',
      new TableIndex({
        name: 'IDX_uploaded_documents_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'uploaded_documents',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('uploaded_documents');
    await queryRunner.query(`DROP TYPE "upload_document_status_enum"`);
  }
}
