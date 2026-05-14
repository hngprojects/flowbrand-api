export const REDIS_MESSAGES = {
  CONNECTION_ESTABLISHED: 'Redis connection established',
  CLIENT_READY: 'Redis client ready',
  CONNECTION_CLOSED: 'Redis connection closed',
  INITIAL_CONNECTION_FAILED: 'Initial Redis connection failed',
  CLIENT_ERROR: 'Redis client error',
  CRITICAL_OOM: 'Critical Redis Out of Memory',
  RECONNECT_ATTEMPT: (attempt: number, delay: number) =>
    `Reconnecting to Redis attempt ${attempt} in ${delay}ms`,
  RETRY_LIMIT_REACHED: 'Redis retry limit reached',
  PATTERN_DELETE_SUCCESS: (count: number, pattern: string) =>
    `Deleted ${count} keys matching pattern: ${pattern}`,
};
