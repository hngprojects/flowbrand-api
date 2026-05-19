import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_BYTES,
} from './constants/upload.constants';
import {
  GetFunnelUploadProgressDocs,
  UploadFunnelDocumentsDocs,
} from './docs/funnels-swagger.doc';
import { UploadService } from './upload.service';

const uploadInterceptor = FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES + 1,
    files: MAX_FILES_PER_UPLOAD,
  },
});

@ApiTags('funnels')
@ApiBearerAuth('JWT')
@Controller('funnels')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @UploadFunnelDocumentsDocs()
  @UseInterceptors(uploadInterceptor)
  async upload(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { statusCode, message, data } =
      await this.uploadService.handleUpload(userId, files);

    res.status(statusCode).json({
      statusCode,
      message,
      data,
    });
  }

  @Get('upload/progress/:uploadId')
  @GetFunnelUploadProgressDocs()
  getProgress(
    @CurrentUser('sub') userId: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    return this.uploadService.getProgress(userId, uploadId);
  }
}
