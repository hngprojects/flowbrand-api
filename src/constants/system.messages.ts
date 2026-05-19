// Individual message constants (single-line exports)
export const USER_CREATED_SUCCESSFULLY = 'User Created Successfully';
export const FAILED_TO_CREATE_USER = 'Error Occurred while creating user, kindly try again';
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
export const AUTH_ACCOUNT_LOCKED = 'Account locked due to too many failed login attempts. Try again later.';
export const AUTH_TOO_MANY_FAILED_ATTEMPTS = 'Too many failed login attempts. Your account has been locked for 1 hour.';

// User messages
export const USER_EMAIL_IN_USE = 'Email already in use';
export const USER_NOT_FOUND = (id: string) => `User ${id} not found`;
export const USER_UPDATE_FAILED = 'Failed to update user';

// OAuth and external auth messages
export const GOOGLE_ACCOUNT_NO_EMAIL = 'Google account has no email';
export const GOOGLE_ACCOUNT_LINK_CONFLICT = 'Google account is linked to a different account';
export const GOOGLE_OAUTH_FAILED = 'Google OAuth authentication failed';
export const GOOGLE_OAUTH_CONFIGURATION_INVALID = 'Google OAuth configuration is missing';
export const USER_OAUTH_CREATION_FAILED = 'Failed to create user account';
export const OAUTH_LOGIN_SUCCESSFUL = 'OAuth login successful';

// Onboarding — API response `message` values (machine-oriented identifiers)
export const ONBOARDING_SESSION_STARTED = 'ONBOARDING_SESSION_STARTED';
export const ONBOARDING_SESSION_RESUMED = 'ONBOARDING_SESSION_RESUMED';
export const ONBOARDING_ALREADY_COMPLETE = 'ONBOARDING_ALREADY_COMPLETE';
export const ONBOARDING_COMPLETE_SUCCESS = 'Onboarding completed successfully';
export const ONBOARDING_INCOMPLETE = 'Onboarding incomplete';
export const ONBOARDING_SESSION_NOT_FOUND =
  'Session not found. Please call POST /onboarding/start to begin the wizard.';
export const ONBOARDING_SESSION_EXPIRED = 'Session has expired. Restart the onboarding process.';
export const ONBOARDING_SESSION_RETRIEVED = 'Onboarding session retrieved successfully';
export const ONBOARDING_UNKNOWN_CHANNEL = 'Unknown discovery channel, defaulting to awareness';

// Error handling
export const VALIDATION_FAILED = 'Validation failed';
export const UPLOAD_FAILED = 'File upload failed';
export const UPLOAD_FILE_TOO_LARGE = 'Uploaded file is too large';
export const UPLOAD_INVALID_FILE = 'Uploaded file type is not allowed';
export const UPLOAD_TOO_MANY_FILES = 'Too many files uploaded';
export const AI_GENERATION_FAILED = 'AI generation failed';

// OTP
export const OTP_SENT_SUCCESSFULLY = 'OTP sent successfully';
export const ACCOUNT_ALREADY_VERIFIED = 'Account is already verified';
export const OTP_RATE_LIMITED = 'Too many OTP requests. Please try again later.';
export const OTP_VERIFIED_SUCCESSFULLY = 'Email verified successfully';
export const OTP_INVALID = 'The OTP code is invalid or has already been used';
export const OTP_EXPIRED = 'Your OTP code has expired. Please request a new one.';
export const OTP_RESENT_SUCCESSFULLY = 'A new verification code has been sent to your email address.';
export const OTP_RESEND_RATE_LIMITED = 'Please wait before requesting a new code.';
export const OTP_RESEND_HOURLY_LIMIT = 'Too many resend requests. Please try again in an hour.';
export const OTP_VERIFY_ATTEMPTS_EXCEEDED = 'Too many failed verification attempts. Please request a new OTP.';

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

// Contact
export const CONTACT_MESSAGE_SENT_SUCCESSFULLY = 'Message sent successfully';
export const CONTACT_CREATED = 'Contact message submitted successfully';
export const CONTACT_SPAM_DETECTED = 'Submission contains prohibited content';

// Spam Detection
export const SPAM_PROHIBITED_CONTENT = 'Submission contains prohibited content';
export const SPAM_TOO_MANY_LINKS = 'Message contains too many links. Please limit to 2 URLs.';
export const SPAM_EXCESSIVE_REPETITION = 'Message contains excessive repetition';
export const SPAM_EXCESSIVE_CAPITALIZATION = 'Message contains excessive capitalization';
export const SPAM_INVALID_CONTENT = 'Message contains invalid content';
export const SPAM_MULTIPLE_EMAILS = 'Message contains multiple email addresses';

// AI Service Messages
export const AI_GEMINI_API_KEY_MISSING = 'Gemini API key is not configured';
export const AI_GEMINI_OUTPUT_FAILED_SCHEMA_VALIDATION = 'Gemini output failed schema validation';
export const AI_GEMINI_NON_JSON_RESPONSE_BODY = 'Gemini returned non-JSON response body';
export const AI_GEMINI_RESPONSE_HAD_NO_TEXT_CONTENT = 'Gemini response had no text content';

export const AI_GROQ_API_KEY_MISSING = 'Groq API key is not configured';
export const AI_GROQ_OUTPUT_FAILED_SCHEMA_VALIDATION = 'Groq output failed schema validation';
export const AI_GROQ_NON_JSON_RESPONSE_BODY = 'Groq returned non-JSON response body';
export const AI_GROQ_RESPONSE_HAD_NO_TEXT_CONTENT = 'Groq response had no text content';

export const AI_PROVIDER_TIMEOUT = (provider: string, timeoutMs: number) =>
  `${provider} request timed out after ${timeoutMs} milliseconds`;

export const AI_PROVIDER_HTTP_ERROR = (provider: string, status: number) => `${provider} HTTP ${status}`;
