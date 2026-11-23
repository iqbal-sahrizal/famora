export type MemberStatus = "active" | "invited" | "suspended" | "removed";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type ThemeMode = "light" | "dark" | "system";
export type DevicePlatform = "web" | "ios_pwa" | "android_pwa" | "desktop_pwa";

export interface ProfileRow {
  id: string;
  full_name: string;
  avatar_path: string | null;
  default_timezone: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency_code: string;
  avatar_path: string | null;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyRoleRow {
  id: string;
  family_id: string | null;
  role_key: string;
  display_name: string;
  description: string;
  is_system: boolean;
  rank_order: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionRow {
  id: string;
  permission_key: string;
  domain: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RolePermissionRow {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMemberRow {
  id: string;
  family_id: string;
  user_id: string | null;
  role_id: string;
  display_name: string;
  is_managed_child: boolean;
  pin_hash: string | null;
  status: MemberStatus;
  access_expires_at: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyInvitationRow {
  id: string;
  family_id: string;
  email: string;
  role_id: string;
  token_hash: string;
  invited_by_member_id: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberPreferencesRow {
  id: string;
  family_id: string;
  member_id: string;
  theme_mode: ThemeMode;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest_enabled: boolean;
  notification_channels: {
    push: boolean;
    email: boolean;
    in_app: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface UserDeviceRow {
  id: string;
  user_id: string;
  device_label: string;
  device_fingerprint: string;
  platform: DevicePlatform;
  push_endpoint: string | null;
  push_p256dh: string | null;
  push_auth: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogRow {
  id: string;
  family_id: string;
  actor_member_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
