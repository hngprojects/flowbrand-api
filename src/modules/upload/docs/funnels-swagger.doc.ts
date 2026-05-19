import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES } from '../constants/upload.constants';

const uploadItemExample = {
  uploadId: '550e8400-e29b-41d4-a716-446655440001',
  fileName: 'pitch-deck.pdf',
  fileType: 'pdf',
  fileSizeBytes: 102400,
  status: 'stored',
  percentComplete: 100,
};

export const UploadFunnelDocumentsDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Upload funnel source documents (up to 3 files)',
      description:
        `Multipart field "files". Allowed: PDF, DOC, DOCX, PPT, PPTX. ` +
        `Max ${MAX_FILES_PER_UPLOAD} files, ${MAX_UPLOAD_BYTES} bytes each. ` +
        `Bytes are stored in S3-compatible object storage (MinIO). ` +
        `Each file is validated and uploaded in parallel; one failure does not cancel the others.`,
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['files'],
        properties: {
          files: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            maxItems: MAX_FILES_PER_UPLOAD,
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description:
        '201 when at least one file stored. Response lists per-file status (stored or failed).',
      schema: {
        example: {
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.FUNNEL_UPLOAD_COMPLETED,
          data: {
            batchId: '550e8400-e29b-41d4-a716-446655440099',
            uploads: [uploadItemExample],
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' }),
    ApiUnprocessableEntityResponse({
      description: 'Every file in the request was rejected (type, size, or storage).',
    }),
    ApiPayloadTooLargeResponse({
      description: 'Multer rejected file before handler (size/count).',
    }),
  );

export const GetFunnelUploadProgressDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Poll upload progress for an owned document',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      schema: {
        example: {
          success: true,
          data: {
            uploadId: uploadItemExample.uploadId,
            fileName: uploadItemExample.fileName,
            fileType: uploadItemExample.fileType,
            fileSizeBytes: uploadItemExample.fileSizeBytes,
            status: 'stored',
            percentComplete: 100,
            uploadedAt: '2026-05-16T12:00:00.000Z',
          },
        },
      },
    }),
    ApiNotFoundResponse({ description: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' }),
  );
