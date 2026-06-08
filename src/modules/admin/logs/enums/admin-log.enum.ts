export enum AdminLogActionType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  SIGNUP = 'signup',
  FUNNEL_GENERATED = 'funnel_generated',
  TASK_COMPLETED = 'task_completed',
  PROFILE_UPDATED = 'profile_updated',
  DOCUMENT_UPLOADED = 'document_uploaded',
  PASSWORD_CHANGED = 'password_changed',
  ACCOUNT_DELETED = 'account_deleted',
}

export enum AdminLogStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
}
