/**
 * Represents the persisted account status of a user.
 * Canonical state constraints:
 * - ACTIVE: is_active = true and deleted_at = null
 * - SUSPENDED: is_active = false and deleted_at = null
 * - DELETED: deleted_at != null
 * 
 * Note: INACTIVE is a computed state (e.g. based on last_login_at) rather than a persisted state.
 */
export enum UserAccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}
