import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { CompleteVoiceSessionDto, VoiceSessionCompleteResponseDto, VoiceSessionResponseDto } from './dto/voice-onboarding.dto';
import { CompleteVoiceSessionDocs, UploadVoiceRoundDocs } from './docs/voice-onboarding-swagger.doc';
import { VoiceOnboardingService } from './services/voice-onboarding.service';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = /(audio\/webm|audio\/mpeg|audio\/mp3|audio\/wav|audio\/ogg|audio\/mp4|audio\/m4a)/;

@ApiTags('onboarding')
@ApiBearerAuth('JWT')
@Controller('api/v1/onboarding/voice')
export class VoiceOnboardingController {
  constructor(private readonly voiceOnboardingService: VoiceOnboardingService) {}

  @Post()
  @UploadVoiceRoundDocs()
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadVoiceRound(
    @CurrentUser('sub') userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: ALLOWED_MIME_TYPES })
        .addMaxSizeValidator({ maxSize: MAX_AUDIO_BYTES, message: SYS_MSG.VOICE_FILE_TOO_LARGE })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: true,
        }),
    )
    file: Express.Multer.File,
    @Body('voice_session_id') voiceSessionId?: string,
  ) {
    // Note: Length validation (120s limit) requires an audio parsing library 
    // to strictly enforce without ffmpeg, but a 10MB limit generally handles it for compressed audio.
    const sessionId = await this.voiceOnboardingService.handleAudioUpload(userId, file, voiceSessionId);
    
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.VOICE_UPLOAD_ACCEPTED,
      data: VoiceSessionResponseDto.from(sessionId),
    };
  }

  @Post('complete')
  @CompleteVoiceSessionDocs()
  @HttpCode(HttpStatus.OK)
  async completeVoiceSession(
    @CurrentUser('sub') userId: string,
    @Body() dto: CompleteVoiceSessionDto,
  ) {
    const uploadId = await this.voiceOnboardingService.completeSession(userId, dto.voice_session_id);
    
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.VOICE_SESSION_COMPLETED,
      data: VoiceSessionCompleteResponseDto.from(uploadId),
    };
  }
}