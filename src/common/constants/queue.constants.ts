export const QUEUES = {
  EMAIL: 'email',
} as const;

export const JOBS = {
  SEND_EMAIL: 'send-email',
} as const;

export const JOB_RETENTION = {
  COMPLETED_MS: 1000 * 60 * 60 * 24,
  FAILED_MS: 1000 * 60 * 60 * 24 * 7,
} as const;
