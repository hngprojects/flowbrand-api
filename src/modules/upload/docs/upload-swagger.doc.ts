import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  UploadBatchResponseDto,
  UploadFilesDto,
  UploadNotFoundResponseDto,
  UploadProgressResponseDto,
  UploadRejectedResponseDto,
  UploadTooManyFilesResponseDto,
} from '../dto/upload-files.dto';
import * as SYS_MSG from '../../../constants/system.messages';
import { MAX_UPLOAD_BYTES, MAX_FILES_PER_UPLOAD } from '../constants/upload.constants';

export const UploadFunnelDocumentsDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Upload funnel source documents (up to 3 files)',
      description:
        `Multipart field "files". Allowed: PDF, DOC, DOCX, PPT, PPTX. ` +
        `Max ${MAX_FILES_PER_UPLOAD} files, ${MAX_UPLOAD_BYTES} bytes each. ` +
        `Bytes are stored in MinIO, then text is extracted asynchronously. ` +
        `Poll progress until status is ready (100%) or failed. ` +
        `Each file is processed in parallel; one failure does not cancel the others.`,
    }),
    ApiConsumes('multipart/form-data'),

    ApiBody({ type: UploadFilesDto }),

    ApiCreatedResponse({
      type: UploadBatchResponseDto,
      description:
        '201 when at least one file accepted. ' +
        'The DTO is served under `data` in the standard envelope: ' +
        '`{ success, statusCode, message, data: <UploadBatchResponseDto> }`. ' +
        'Per-file status (parsing, ready, or failed) is inside `data`. Poll until ready.',
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' }),
    ApiUnprocessableEntityResponse({
      type: UploadRejectedResponseDto,
      description: 'Every file in the request was rejected (type, size, or storage).',
    }),
    ApiBadRequestResponse({
      type: UploadTooManyFilesResponseDto,
      description: SYS_MSG.UPLOAD_TOO_MANY_FILES,
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
    ApiOkResponse({
      type: UploadProgressResponseDto,
      description:
        '200 when the upload belongs to the user and progress is available. ' +
        'The DTO is served under `data` in the standard envelope: ' +
        '`{ success, statusCode, message, data: <UploadProgressResponseDto> }`.',
    }),
    ApiNotFoundResponse({
      type: UploadNotFoundResponseDto,
      description: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND,
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' }),
  );
