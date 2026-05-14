export const USER_CREATED_SUCCESSFULLY = 'User Created Successfully';
export const USER_CREATED = 'User Created Successfully';
export const FAILED_TO_CREATE_USER = 'Error Occured while creating user, kindly try again';
export const ERROR_OCCURED = 'Error Occured Performing this request';
export const USER_ACCOUNT_EXIST = 'Account with the specified email exists';
export const USER_ACCOUNT_DOES_NOT_EXIST = "Account with the specified email doesn't exist";
export const USER_ACCOUNT_LOCKED = 'Account with the specified email is locked';
export const AUTH_MESSAGES = {
  LOGIN_SUCCESSFUL: 'Login successful',
  LOGOUT_SUCCESSFUL: 'Logout successful',
  TOKEN_REFRESHED: 'Token refreshed successfully',
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
};
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
