export const QUEUES = {
  FUNNEL_GENERATION: 'funnel-generation',
  EMAIL: 'email',
  DOCUMENT_EXTRACTION: 'document-extraction',
} as const;

export const JOBS = {
  GENERATE_FUNNEL: 'generate-funnel',
  SEND_EMAIL: 'send-email',
  EXTRACT_TEXT: 'extract-text',
} as const;

export const JOB_RETENTION = {
  COMPLETED_MS: 1000 * 60 * 60 * 24,
  FAILED_MS: 1000 * 60 * 60 * 24 * 7,
} as const;
