import { HttpStatus } from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';

export const funnelListExample = {
  success: true,
  data: {
    funnels: [
      {
        funnelId: '550e8400-e29b-41d4-a716-446655440001',
        businessName: 'Acme Studio',
        creationPath: 'google-ads',
        status: 'active',
        createdAt: '2026-05-18T12:00:00.000Z',
        stages: [{ position: 1, name: 'Discovery', status: 'complete' }],
      },
    ],
    pagination: {
      total: 1,
      page: 1,
      perPage: 20,
      hasNext: false,
    },
  },
};

export const funnelFullExample = {
  success: true,
  data: {
    funnelId: '550e8400-e29b-41d4-a716-446655440001',
    businessName: 'Acme Studio',
    creationPath: 'google-ads',
    status: 'active',
    createdAt: '2026-05-18T12:00:00.000Z',
    stages: [
      {
        stageId: '550e8400-e29b-41d4-a716-446655440010',
        position: 1,
        name: 'Discovery',
        channel: 'email',
        status: 'complete',
        unlockedAt: '2026-05-17T12:00:00.000Z',
        completedAt: '2026-05-17T13:00:00.000Z',
        explanation: 'Understand the target audience.',
        actionPrompt: 'Review the lead magnet.',
        tasks: [{ id: 'task-1', position: 1, name: 'Define ICP', status: 'complete' }],
        tasksTotal: 1,
        tasksComplete: 1,
      },
    ],
  },
};

export const funnelStagesSummaryExample = {
  success: true,
  data: [
    {
      stageId: '550e8400-e29b-41d4-a716-446655440010',
      position: 1,
      name: 'Discovery',
      channel: 'email',
      status: 'complete',
      unlockedAt: '2026-05-17T12:00:00.000Z',
      completedAt: '2026-05-17T13:00:00.000Z',
      tasksTotal: 1,
      tasksComplete: 1,
    },
  ],
};

export const funnelStageDetailExample = {
  success: true,
  data: {
    stageId: '550e8400-e29b-41d4-a716-446655440010',
    position: 2,
    name: 'Validation',
    channel: 'email',
    status: 'active',
    unlockedAt: '2026-05-18T12:00:00.000Z',
    completedAt: null,
    explanation: 'Validate demand before moving on.',
    actionPrompt: 'Contact the first five leads.',
    tasks: [{ id: 'task-2', position: 1, name: 'Send outreach', status: 'pending' }],
    tasksTotal: 1,
    tasksComplete: 0,
  },
};

export const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
  path: '/api/funnels',
  timestamp: '2026-05-18T12:00:00.000Z',
};

export const notFoundExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: SYS_MSG.ONBOARDING_SESSION_NOT_FOUND,
  path,
  timestamp: '2026-05-18T12:00:00.000Z',
});

export const forbiddenStageLockedExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.FORBIDDEN,
  error: 'ForbiddenException',
  message: SYS_MSG.STAGE_LOCKED('Validation', 'Discovery'),
  path,
  timestamp: '2026-05-18T12:00:00.000Z',
});
