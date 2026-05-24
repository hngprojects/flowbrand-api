import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as os from 'node:os';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES } from './constants/upload.constants';
import { GetFunnelUploadProgressDocs, UploadFunnelDocumentsDocs } from './docs/upload-swagger.doc';
import { UploadBatchResponseDto, UploadProgressResponseDto } from './dto/upload-files.dto';
import { UploadService } from './upload.service';

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
  async upload(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.uploadService.handleUpload(userId, files);
    res.status(HttpStatus.CREATED).json(UploadBatchResponseDto.from(result));
  }

  @Get('upload/progress/:uploadId')
  @GetFunnelUploadProgressDocs()
  async getProgress(
    @CurrentUser('sub') userId: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Res() res: Response,
  ) {
    const progress = await this.uploadService.getProgress(userId, uploadId);

    res.status(HttpStatus.OK).json(UploadProgressResponseDto.from(progress));
  }
}