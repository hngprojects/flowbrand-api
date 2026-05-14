import { applyDecorators, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";

export function GetSessionDocs(){
    return applyDecorators(
        HttpCode(HttpStatus.OK),
        ApiBearerAuth(),
        ApiOperation({ summary: 'Get user session' }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Session gotten successfully',
            schema: {
                example: {
                    success: true,
                    data: {
                        sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                        status: 'in_progress',
                        steps_completed: 2,
                        answers: {
                            step_1: { name: 'Jane Doe' },
                            step_2: { industry: 'Tech' }
                        },
                        created_at: '2026-05-14T10:00:00.000Z',
                        expires_at: '2026-05-21T10:00:00.000Z'
                    }
                }
            }
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'Missing or invalid bearer token.'
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'No active session found or session has expired'
        })
    )
}