import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

export function TriggerReaperDocs() {
  return applyDecorators(
    ApiTags('Tasks'),
    ApiOperation({ summary: 'Manually trigger the background reaper for stuck funnels and uploads' }),
    ApiResponse({
      status: 200,
      description: SYS_MSG.REAPER_TRIGGERED_SUCCESSFULLY,
    }),
  );
}