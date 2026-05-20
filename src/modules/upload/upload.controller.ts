import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as os from 'node:os';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES } from './constants/upload.constants';
import { GetFunnelUploadProgressDocs, UploadFunnelDocumentsDocs } from './docs/upload-swagger.doc';
import { UploadService } from './upload.service';
import type { UploadBatchResponse } from './upload.types';

const uploadInterceptor = FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
  storage: diskStorage({
    destination: os.tmpdir(),
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_FILES_PER_UPLOAD,
  },
});

@ApiTags('funnels')
@ApiBearerAuth('JWT')
@Controller('funnels')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UploadFunnelDocumentsDocs()
  @UseInterceptors(uploadInterceptor)
  upload(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<UploadBatchResponse> {
    return this.uploadService.handleUpload(userId, files);
  }

  @Get('upload/progress/:uploadId')
  @GetFunnelUploadProgressDocs()
  getProgress(@CurrentUser('sub') userId: string, @Param('uploadId', ParseUUIDPipe) uploadId: string) {
    return this.uploadService.getProgress(userId, uploadId);
  }
}
