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
export const AUTH_INVALID_TOKEN = 'Invalid or expired token';
export const AUTH_INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';
export const AUTH_UNAUTHENTICATED_MESSAGE = 'Unauthenticated';
export const AUTH_TERMS_REQUIRED = 'You must accept the terms and conditions to register';
export const AUTH_ACCOUNT_LOCKED = 'Account locked due to too many failed login attempts. Try again later.';
export const AUTH_TOO_MANY_FAILED_ATTEMPTS = 'Too many failed login attempts. Your account has been locked for 1 hour.';
export const REGISTRATION_SUCCESSFUL_VERIFY_EMAIL = 'Registration successful. Please verify your email.';
export const AUTH_EMAIL_UNVERIFIED = 'Please verify your email address to log in.';

// User messages
export const USER_EMAIL_IN_USE = 'Email already in use';
export const USER_NOT_FOUND = (id: string) => `User ${id} not found`;
export const USER_UPDATE_FAILED = 'Failed to update user';
export const USER_UNAUTHORIZED = 'User not authorized';

// OAuth and external auth messages
export const GOOGLE_ACCOUNT_NO_EMAIL = 'Google account has no email';
export const GOOGLE_ACCOUNT_LINK_CONFLICT = 'Google account is linked to a different account';
export const GOOGLE_EMAIL_ALREADY_LOCAL_ACCOUNT =
  'This email is registered with a password. Please sign in with your email and password.';
export const GOOGLE_OAUTH_FAILED = 'Google OAuth authentication failed';
export const GOOGLE_OAUTH_CONFIGURATION_INVALID = 'Google OAuth configuration is missing';
export const USER_OAUTH_CREATION_FAILED = 'Failed to create user account';
export const OAUTH_LOGIN_SUCCESSFUL = 'OAuth login successful';
export const GOOGLE_EXCHANGE_CODE_INVALID = 'Invalid or expired exchange code';

// Onboarding — API response `message` values (machine-oriented identifiers)
export const ONBOARDING_SESSION_STARTED = 'Onboarding session started';
export const ONBOARDING_SESSION_RESUMED = 'Onboarding session resumed';
export const ONBOARDING_ALREADY_COMPLETE = 'Onboarding already complete';
export const ONBOARDING_COMPLETE_SUCCESS = 'Onboarding completed successfully';
export const ONBOARDING_INCOMPLETE = 'Onboarding incomplete';
export const ONBOARDING_SESSION_RETRIEVED = 'Onboarding session retrieved successfully';
export const ONBOARDING_SESSION_NOT_FOUND =
  'Session not found. Please call POST /onboarding/start to begin the wizard.';
export const ONBOARDING_SESSION_EXPIRED = 'Session has expired. Restart the onboarding process.';
export const ONBOARDING_STEP_SAVED = 'Onboarding step saved';
export const ONBOARDING_SESSION_NOT_BELONG = 'Session not found or does not belong to this user';
export const ONBOARDING_SESSION_FORBIDDEN = 'Session has expired. Please start a new onboarding session.';
export const ONBOARDING_SESSION_COMPLETE = 'Onboarding already complete';
export const ONBOARDING_INVALID_STEP = 'Step must be 1, 2, or 3';

// Error handling
export const VALIDATION_FAILED = 'Validation failed';
export const UPLOAD_FAILED = 'File upload failed';
export const UPLOAD_FILE_TOO_LARGE = 'Uploaded file is too large';
export const UPLOAD_INVALID_FILE = 'Uploaded file type is not allowed';
export const UPLOAD_INTERRUPTED = 'Upload incomplete: received bytes do not match expected size.';
export const UPLOAD_TOO_MANY_FILES = 'Too many files uploaded; maximum allowed is 3.';

// Funnel uploads
export const UPLOAD_BATCH_ACCEPTED = 'Files accepted for processing';
export const FUNNEL_UPLOAD_COMPLETED = 'Funnel upload completed';
export const FUNNEL_UPLOAD_PARTIAL = 'Some files were rejected; see uploads[].errorMessage for details';
export const FUNNEL_UPLOAD_ALL_REJECTED = 'All files were rejected; see details[]';
export const FUNNEL_UPLOAD_NOT_FOUND = 'Upload not found or not owned by user';
export const FUNNEL_UPLOAD_FILES_REQUIRED = 'At least one file is required in the files field';
export const FUNNEL_UPLOAD_PARSE_FAILED = 'Could not extract text from the uploaded document';
export const FUNNEL_UPLOAD_UNSUPPORTED_FILE_TYPE = 'Unsupported file type for text extraction';
export const FUNNEL_UPLOAD_NO_EXTRACTABLE_TEXT = 'No extractable text found in document';
export const FUNNEL_UPLOAD_NO_SLIDES = 'No slides found in presentation';
export const FUNNEL_UPLOAD_PPTX_TOO_LARGE = 'PPTX file exceeds the maximum allowed size for extraction';
export const FUNNEL_UPLOAD_PPTX_TOO_MANY_SLIDES = 'PPTX file exceeds the maximum allowed slide count for extraction';
export const FUNNEL_UPLOAD_PROGRESS_RETRIEVED = 'Funnel upload progress retrieved successfully';

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
export const STAGE_LOCKED = (stageName: string, priorStageName: string) =>
  `The ${stageName} stage is locked. Complete all tasks in ${priorStageName} and mark it complete to unlock.`;

// Funnel Display APIs
export const FUNNEL_RETRIEVED_SUCCESSFULLY = 'Funnel retrieved successfully';
export const FUNNELS_RETRIEVED_SUCCESSFULLY = 'Funnels retrieved successfully';
export const FUNNEL_STAGES_RETRIEVED_SUCCESSFULLY = 'Funnel stages retrieved successfully';
export const FUNNEL_STAGE_RETRIEVED_SUCCESSFULLY = 'Funnel stage retrieved successfully';
export const FUNNEL_STAGE_NOT_FOUND = 'Funnel stage not found or not owned by you';
export const FUNNEL_OR_STAGE_NOT_FOUND = 'Funnel or stage not found or not owned by you';
export const FUNNEL_STAGE_LOCKED_MESSAGE = (stageName: string, priorStageName: string) =>
  `The ${stageName} stage is locked. Complete all tasks in ${priorStageName} and mark it complete to unlock.`;
export const STAGE_COMPLETED_SUCCESSFULLY = 'Stage completed successfully';
export const STAGE_ALREADY_COMPLETE = 'Stage already complete';
export const STAGE_HAS_PENDING_TASKS = (count: number) => `Cannot complete stage: ${count} task(s) are still pending.`;
export const STAGE_HAS_NO_TASKS = 'Stage has no tasks. Cannot be marked complete.';
export const STAGE_COMPLETION_REQUIRES_ACTIVE_FUNNEL = 'Funnel must be active before a stage can be completed.';
export const STAGE_COMPLETION_CONCURRENT_UPDATE = 'Stage completion failed due to a concurrent update. Please retry.';
export const FUNNEL_UNAUTHORIZED_ACCESS = 'You do not have permission to access this funnel';
export const FUNNEL_TASK_NOT_FOUND = 'Funnel task not found or not accessible.';
export const TASK_STATUS_UPDATED_SUCCESSFULLY = 'Task updated successfully';

// Password Reset Messages
export const PASSWORD_RESET_OTP_SENT = 'If your email is registered, you will receive a password reset code.';
export const PASSWORD_RESET_INVALID_OTP = 'Invalid or expired reset code.';
export const PASSWORD_RESET_EXPIRED = 'Reset code has expired. Please request a new one.';
export const PASSWORD_RESET_SUCCESSFUL = 'Password reset successful. You have been automatically logged in.';
export const PASSWORD_RESET_RATE_LIMITED = 'Too many password reset requests. Please try again later.';
export const PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED = 'Too many verification attempts. Please try again later.';
export const PASSWORD_RESET_OTP_VERIFIED = 'OTP verified. Use the reset token to set your new password.';
export const PASSWORD_RESET_INVALID_TOKEN = 'Invalid or expired reset token.';

//Password Change Messages
export const PASSWORD_CHANGE_SUCCESSFUL = 'Password changed successfully';
export const INCORRECT_OLD_PASSWORD = 'The old password you entered is incorrect.';
export const PASSWORD_CHANGE_NOT_SUPPORTED =
  'Password change is not supported for accounts registered via Google OAuth';
export const PASSWORD_CHANGE_NOT_SUCCESSFUL = 'New password cannot be the same as the old password';
export const INCORRECT_CONFIRM_PASSWORD = 'The value of the confirm password does not match the new password';
export const PASSWORD_CHANGE_UNAVAILABLE = 'Password change is not available for this account';
export const PASSWORD_TOO_WEAK =
  'Your new password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';
// Waitlist
export const WAITLIST_JOINED_SUCCESSFULLY = 'Successfully joined the waitlist';
export const WAITLIST_ALREADY_JOINED = 'You are already on the waitlist';

// Contact
export const CONTACT_MESSAGE_SENT_SUCCESSFULLY = 'Message sent successfully';
export const CONTACT_CREATED = 'Contact message submitted successfully';
export const CONTACT_SPAM_DETECTED = 'Submission contains prohibited content';

// Notifications
export const NOTIFICATIONS_RETRIEVED_SUCCESSFULLY = 'Notifications retrieved successfully';
export const NOTIFICATION_UNREAD_COUNT_RETRIEVED = 'Notification unread count retrieved successfully';
export const NOTIFICATION_MARKED_AS_READ = 'Notification marked as read';
export const NOTIFICATIONS_MARKED_AS_READ = 'Notifications marked as read';
export const NOTIFICATIONS_MARKED_AS_UNREAD = 'Notifications marked as unread';
export const NOTIFICATION_DELETED = 'Notification deleted.';
export const NOTIFICATION_NOT_FOUND = 'Notification not found';
export const NOTIFICATION_PREFERENCES_UPDATE_FAILED = 'Notification preferences changed during update. Please retry.';

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

// Funnel messages
export const FUNNEL_GENERATION_STARTED = 'Funnel generation started.';
export const FUNNEL_ALREADY_EXISTS = 'Funnel already exists.';
export const GENERATION_IN_PROGRESS = 'A funnel is already being generated for your account.';
export const FUNNEL_NOT_FOUND = 'Funnel not found.';
export const FUNNEL_DELETED = 'Funnel deleted.';
export const FUNNEL_CANNOT_DELETE_ONLY_ACTIVE =
  'You cannot delete your only active funnel. Create another strategy first.';
export const FUNNEL_RENAMED_SUCCESSFULLY = 'Funnel renamed successfully.';
export const FUNNEL_STATUS_RETRIEVED = 'Funnel status retrieved.';
export const GENERATION_SERVICE_UNAVAILABLE =
  'Funnel generation service is temporarily unavailable. Please try again shortly.';
export const GENERATION_RATE_LIMIT_EXCEEDED =
  'You have started too many funnel generations recently. Please wait and try again.';
export const UPLOAD_NOT_READY = 'One or more uploaded documents are not yet ready for funnel generation.';
export const UPLOAD_OWNERSHIP_INVALID = 'One or more uploaded documents do not belong to you.';
export const GENERATION_FAILED = 'Funnel generation failed. Please retry from the dashboard.';
export const FEEDBACK_SUBMITTED = 'Feedback submitted successfully';
export const FEEDBACK_ALREADY_SUBMITTED = 'Feedback already submitted for this stage';
export const FEEDBACK_STAGE_NOT_COMPLETE = 'Feedback can only be submitted for completed stages';

// User State (M4-BE-013)
export const USER_STATE_RETRIEVED = 'User state retrieved successfully';
export const USER_NOT_FOUND_BY_TOKEN = 'User associated with this token no longer exists';
// Profile
export const PROFILE_RETRIEVED_SUCCESSFULLY = 'Profile retrieved successfully';
export const PROFILE_UPDATED_SUCCESSFULLY = 'Profile updated successfully';
export const PROFILE_NOT_FOUND = 'Profile not found';
export const PROFILE_EMAIL_CHANGE_FORBIDDEN = 'Email cannot be changed here. Please contact support.';
export const PROFILE_UPDATE_FAILED = 'Failed to update profile';
export const PROFILE_AVATAR_FILE_REQUIRED = 'Avatar file is required';
export const PROFILE_AVATAR_UPLOADED_SUCCESSFULLY = 'Profile avatar uploaded successfully';
export const PROFILE_AVATAR_REMOVED_SUCCESSFULLY = 'Profile avatar removed successfully';
export const PROFILE_AVATAR_UPLOAD_INVALID_TYPE = 'Avatar must be a valid JPEG, PNG, or WebP image';
export const PROFILE_AVATAR_UPLOAD_TOO_LARGE = 'Avatar file size must be 2MB or less';
export const PROFILE_AVATAR_UPLOAD_FAILED = 'Failed to upload profile avatar';
export const PROFILE_AVATAR_DELETE_FAILED = 'Failed to remove profile avatar';

// Notification Preferences
export const NOTIFICATION_PREFERENCES_RETRIEVED_SUCCESSFULLY = 'Notification preferences retrieved successfully';
export const NOTIFICATION_PREFERENCES_UPDATED_SUCCESSFULLY = 'Notification preferences updated successfully';

// Account Deletion
export const ACCOUNT_DELETED_SUCCESSFULLY = 'Your account has been deleted. You will be signed out.';
export const ACCOUNT_ALREADY_DELETED = 'Account already deleted';
export const ACCOUNT_DELETION_CONFIRMATION_REQUIRED = 'You must type DELETE to confirm account deletion';
export const ACCOUNT_DELETION_FAILED = 'Failed to delete account';
export const ACCOUNT_DELETION_SCHEDULED = 'Account deletion scheduled for 30 days from now';
export const ACCOUNT_EXISTS_WITH_RETENTION =
  'An account with this email exists. If you recently deleted your account, please wait 30 days.';

// Tasks
export const REAPER_TRIGGERED_SUCCESSFULLY = 'Background reaper triggered successfully';

// Rate limits
export const AUTH_REGISTER_RATE_LIMITED = 'Too many registration attempts. Please try again in an hour.';
export const AUTH_LOGIN_RATE_LIMITED = 'Too many login attempts from this IP. Please try again later.';
export const AUTH_REFRESH_RATE_LIMITED = 'Too many token refresh requests. Please try again later.';
export const UPLOAD_RATE_LIMIT_EXCEEDED = 'Upload limit reached. You can upload up to 20 batches per hour.';

// Admin auth
export const ADMIN_LOGIN_SUCCESSFUL = 'Admin login successful';
export const ADMIN_LOGOUT_SUCCESSFUL = 'Admin logout successful';
export const ADMIN_INVALID_CREDENTIALS = 'Invalid email or password';
export const ADMIN_ACCOUNT_LOCKED = 'Account temporarily locked';
export const ADMIN_ACCESS_DENIED = 'Access denied';
export const ADMIN_CREATED_SUCCESSFULLY = 'Admin account created successfully';
export const ADMIN_EMAIL_CONFLICT = 'Email already registered';
export const ADMIN_TOKEN_REFRESHED = 'Token refreshed';
export const ADMIN_INVALID_PASSWORD_VALUE =
  'password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character';
export const ADMIN_PROFILE_RETRIEVED_SUCCESSFULLY = 'Admin profile retrieved successfully';
export const ADMIN_PROFILE_UPDATED_SUCCESSFULLY = 'Admin profile updated successfully';
export const ADMIN_PROFILE_NOT_FOUND = 'Admin profile not found';
export const ADMIN_PROFILE_UPDATE_FAILED = 'Failed to update admin profile';
export const ADMIN_PROFILE_EMAIL_CHANGE_FORBIDDEN = 'Email cannot be changed here';
export const ADMIN_PROFILE_RESPONSE_ROLE_RESOLUTION_FAILED = 'Failed to resolve admin role for profile response';
export const ADMIN_PASSWORD_UPDATED_SUCCESSFULLY = 'Password updated successfully';
export const ADMIN_OLD_PASSWORD_INCORRECT = 'Old password is incorrect';
export const ADMIN_NEW_PASSWORD_MUST_DIFFER_FROM_OLD = 'New password must be different from your current password';
export const ADMIN_CONFIRM_PASSWORD_MISMATCH = 'Confirm password must match new password';
export const ADMIN_PASSWORD_POLICY_VALIDATION_FAILED =
  'new_password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one digit, and one symbol';
export const ADMIN_DASHBOARD_STATS_RETRIEVED = 'Admin dashboard stats retrieved successfully';
export const ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED = 'Admin dashboard weekly overview retrieved successfully';
export const ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED = 'Admin dashboard user segments retrieved successfully';
export const ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED = 'Admin dashboard funnel performance retrieved successfully';
export const ADMIN_DASHBOARD_USER_STAGES_RETRIEVED = 'Admin dashboard user stages retrieved successfully';
export const ADMIN_DASHBOARD_USER_RETENTION_RETRIEVED = 'Admin dashboard user retention retrieved successfully';

// Payment messages
export const PAYMENT_FAILED = 'Payment could not be processed';
export const PAYMENT_PROVIDER_NOT_IMPLEMENTED = 'Payment provider is not yet implemented';
export const PAYMENT_ALREADY_INITIATED = 'A payment for this request is already in progress';
export const SUBSCRIPTION_ALREADY_ACTIVE = 'An active subscription already exists for this user';
export const SUBSCRIPTION_INITIATED_SUCCESSFULLY = 'Subscription initiated successfully';
export const SUBSCRIPTION_RATE_LIMIT_EXCEEDED = 'Too many subscription requests. Please try again later';
export const SUBSCRIPTION_USER_ALREADY_SUBSCRIBED = 'You already have an active or pending subscription';

// Admin users list
export const ADMIN_USERS_LIST_RETRIEVED = 'Users retrieved successfully';
export const ADMIN_GLOBAL_SEARCH_SUCCESSFUL = 'Admin global search results retrieved successfully';
export const ADMIN_USER_PROFILE_RETRIEVED = 'User profile retrieved successfully';
export const ADMIN_USER_STATUS_UPDATED = 'User status updated successfully';
export const ADMIN_USER_DELETED = 'User account deleted successfully';
export const ADMIN_USER_NOT_FOUND = 'User not found';
export const ADMIN_CANNOT_DELETE_SELF = 'You cannot delete your own user account as an admin';
// Admin logs
export const ADMIN_LOGS_RETRIEVED = 'Admin logs retrieved successfully';
export const ADMIN_LOGS_INVALID_DATE_RANGE = 'date_from must be earlier than or equal to date_to';
// Admin notifications
export const ADMIN_NOTIFICATIONS_RETRIEVED = 'Admin notifications retrieved successfully';
export const ADMIN_NOTIFICATION_NOT_FOUND = 'Notification not found';
export const ADMIN_NOTIFICATION_MARKED_READ = 'Notification marked as read';
export const ADMIN_NOTIFICATIONS_MARKED_READ = 'Notifications marked as read';
export const ADMIN_NOTIFICATIONS_MARKED_UNREAD = 'Notifications marked as unread';
export const ADMIN_NOTIFICATION_DELETED = 'Notification deleted successfully';
export const ADMIN_NOTIFICATIONS_BULK_DELETED = 'Notifications deleted successfully';
export const ADMIN_NOTIFICATION_STAR_TOGGLED = 'Notification star updated successfully';
export const ADMIN_NOTIFICATION_BULK_SELECTION_REQUIRED = 'Provide either ids or all: true';
export const ADMIN_NOTIFICATION_BULK_SELECTION_AMBIGUOUS = 'Provide either ids or all: true, not both';
export const WEBHOOK_SIGNATURE_INVALID = 'Webhook signature verification failed';
export const WEBHOOK_RECEIVED = 'Webhook received';
export const WEBHOOK_PROCESSING_ERROR = 'Webhook processing failed';
export const NOTIFICATION_PLAN_UPGRADED_TITLE = "You're now on Pro";
export const NOTIFICATION_PLAN_UPGRADED_BODY = 'Full access unlocked. Enjoy all SEIL features.';
export const PAYMENT_PRICE_NOT_SET = (label: string, fallback: number) =>
  `${label} not set — using placeholder ${fallback} kobo`;
export const PAYMENT_PRICE_ZERO_MISCONFIGURATION = (label: string, fallback: number) =>
  `${label} is zero — treating as misconfiguration, using placeholder ${fallback} kobo`;
export const PAYMENT_USER_ALREADY_PRO = 'You are already on the Pro plan';
export const PAYMENT_INITIATED_SUCCESSFULLY = 'Payment initiated successfully';
export const PAYMENT_RATE_LIMIT_EXCEEDED = 'Too many payment requests. Please try again later';
export const SUBSCRIPTION_CANCEL_TOKEN_MISSING = 'Subscription cancel failed: provider did not return email token';
export const PAYMENT_NOT_FOUND = 'Payment not found or does not belong to this account';
export const PAYMENT_VERIFIED_SUCCESSFULLY = 'Payment verified successfully';
export const PAYMENT_PROVIDER_TIMEOUT = 'Payment provider did not respond in time';
export const PAYMENT_AMOUNT_MISMATCH = 'Payment amount does not match the expected price — contact support';
export const SUBSCRIPTION_NOT_FOUND = 'No active subscription found';
export const SUBSCRIPTION_ALREADY_CANCELLED = 'Subscription is already cancelled or has expired';
export const SUBSCRIPTION_PROVIDER_CODE_MISSING = 'Subscription provider identifier is missing — contact support';
export const SUBSCRIPTION_CANCELLED_SUCCESSFULLY = 'Subscription cancelled successfully';
export const SUBSCRIPTION_RETRIEVED_SUCCESSFULLY = 'Subscription retrieved successfully';
export const NOTIFICATION_SUBSCRIPTION_CANCELLED_TITLE = 'Your subscription has been cancelled';
export const NOTIFICATION_SUBSCRIPTION_CANCELLED_BODY = (date: string) => `You have access until ${date}.`;
export const NOTIFICATION_PAYMENT_FAILED_TITLE = 'Your payment could not be processed';
export const NOTIFICATION_PAYMENT_FAILED_BODY = 'Please update your payment details to continue enjoying Pro.';

// Admin Teams
export const TEAMS_RETRIEVED_SUCCESSFULLY = 'Teams retrieved successfully';
export const TEAM_CREATED_SUCCESSFULLY = 'Team created successfully';
export const TEAM_DELETED_SUCCESSFULLY = 'Team deleted successfully';
export const TEAM_NOT_FOUND = 'Team not found';
export const TEAM_INVITES_DISPATCHED = 'Invitations processed';
export const TEAM_INVITATIONS_RETRIEVED = 'Invitations retrieved successfully';
export const TEAM_INVITATION_REVOKED = 'Invitation revoked successfully';
export const TEAM_INVITATION_NOT_FOUND = 'Invitation not found or already processed';
export const TEAM_INVITE_ALREADY_PENDING = 'An invitation for this email is already pending';
export const TEAM_ALREADY_MEMBER = 'This user is already a team member.';

// Invite Accept & member Revoke
export const INVITE_TOKEN_INVALID = 'Invalid invitation token.';
export const INVITE_ALREADY_USED = 'This invitation has already been used or revoked.';
export const INVITE_EXPIRED = 'This invitation has expired.';
export const INVITE_ACCEPTED_SUCCESSFULLY = 'Invitation accepted successfully.';
export const MEMBER_REVOKE_SELF_FORBIDDEN = 'You cannot revoke your own access.';
export const MEMBER_NOT_FOUND = 'Team member not found.';
export const MEMBER_REVOKED_SUCCESSFULLY = 'Member access revoked successfully.';
export const PASSWORD_VALIDATION_FAILED =
  'password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character';
