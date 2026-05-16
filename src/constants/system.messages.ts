// Individual message constants (single-line exports)
export const USER_CREATED_SUCCESSFULLY = 'User Created Successfully';
export const FAILED_TO_CREATE_USER = 'Error Occured while creating user, kindly try again';
export const USER_ACCOUNT_EXIST = 'Account with the specified email exists';
export const USER_ACCOUNT_DOES_NOT_EXIST = "Account with the specified email doesn't exist";
export const USER_ACCOUNT_LOCKED = 'Account with the specified email is locked';

// Auth messages
export const AUTH_LOGIN_SUCCESSFUL = 'Login successful';
export const AUTH_LOGOUT_SUCCESSFUL = 'Logout successful';
export const AUTH_TOKEN_REFRESHED = 'Token refreshed successfully';
export const AUTH_INVALID_CREDENTIALS = 'Invalid email or password';
export const AUTH_INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';
export const AUTH_UNAUTHENTICATED_MESSAGE = 'Unauthenticated';
export const AUTH_TERMS_REQUIRED = 'You must accept the terms and conditions to register';
export const AUTH_ACCOUNT_LOCKED =
  'Account locked due to too many failed login attempts. Try again later.';
export const AUTH_TOO_MANY_FAILED_ATTEMPTS =
  'Too many failed login attempts. Your account has been locked for 1 hour.';

// User messages
export const USER_EMAIL_IN_USE = 'Email already in use';
export const USER_NOT_FOUND = (id: string) => `User ${id} not found`;
export const USER_UPDATE_FAILED = 'Failed to update user';

// Onboarding — API response `message` values (machine-oriented identifiers)
export const ONBOARDING_SESSION_STARTED = 'ONBOARDING_SESSION_STARTED';
export const ONBOARDING_SESSION_RESUMED = 'ONBOARDING_SESSION_RESUMED';
export const ONBOARDING_ALREADY_COMPLETE = 'ONBOARDING_ALREADY_COMPLETE';

// Error handling
export const VALIDATION_FAILED = 'Validation failed';
export const UPLOAD_FAILED = 'File upload failed';
export const UPLOAD_FILE_TOO_LARGE = 'Uploaded file is too large';
export const UPLOAD_INVALID_FILE = 'Uploaded file type is not allowed';
export const UPLOAD_TOO_MANY_FILES = 'Too many files uploaded';
export const AI_GENERATION_FAILED = 'AI generation failed';

// Health
export const HEALTH_OK = 'ok';
export const HEALTH_DEGRADED = 'degraded';
export const HEALTH_SERVICE_UP = 'ok';
export const HEALTH_SERVICE_DOWN = 'down';

// HTTP
export const HTTP_INTERNAL_SERVER_ERROR = 'Internal server error';
export const HTTP_INTERNAL_SERVER_ERROR_NAME = 'InternalServerError';

// Redis
export const REDIS_CONNECTION_ESTABLISHED = 'Redis connection established';
export const REDIS_CLIENT_READY = 'Redis client ready';
export const REDIS_CONNECTION_CLOSED = 'Redis connection closed';
export const REDIS_INITIAL_CONNECTION_FAILED = 'Initial Redis connection failed';
export const REDIS_CLIENT_ERROR = 'Redis client error';
export const REDIS_CRITICAL_OOM = 'Critical Redis Out of Memory';
export const REDIS_RECONNECT_ATTEMPT = (attempt: number, delay: number) =>
  `Reconnecting to Redis attempt ${attempt} in ${delay}ms`;
export const REDIS_RETRY_LIMIT_REACHED = 'Redis retry limit reached';
export const REDIS_PATTERN_DELETE_SUCCESS = (count: number, pattern: string) =>
  `Deleted ${count} keys matching pattern: ${pattern}`;

// Waitlist
export const WAITLIST_JOINED_SUCCESSFULLY = 'Successfully joined the waitlist';
export const WAITLIST_ALREADY_JOINED = 'You are already on the waitlist';
