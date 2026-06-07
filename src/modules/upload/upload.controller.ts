import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import * as os from 'node:os';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES } from './constants/upload.constants';
import { GetFunnelUploadProgressDocs, UploadFunnelDocumentsDocs } from './docs/upload-swagger.doc';
import { UploadBatchDataDto, UploadProgressDataDto } from './dto/upload-files.dto';
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
  @UploadFunnelDocumentsDocs()
  @UseInterceptors(uploadInterceptor)
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    const result = await this.uploadService.handleUpload(userId, files, req);
    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.UPLOAD_BATCH_ACCEPTED,
      data: UploadBatchDataDto.from(result),
    };
  }

  @Get('upload/progress/:uploadId')
  @GetFunnelUploadProgressDocs()
  @HttpCode(HttpStatus.OK)
  async getProgress(@CurrentUser('sub') userId: string, @Param('uploadId', ParseUUIDPipe) uploadId: string) {
    const progress = await this.uploadService.getProgress(userId, uploadId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_UPLOAD_PROGRESS_RETRIEVED,
      data: UploadProgressDataDto.from(progress),
    };
  }
}
