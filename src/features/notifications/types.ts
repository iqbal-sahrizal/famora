export type NotificationCategory =
  | "invitation"
  | "announcement"
  | "calendar"
  | "task_assignment"
  | "task_deadline"
  | "shopping"
  | "bill_reminder"
  | "document_expiration"
  | "chat"
  | "activity";

export type NotificationPushStatus =
  | "pending"
  | "sent"
  | "suppressed_quiet_hours"
  | "suppressed_preference"
  | "failed"
  | "skipped";

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  domain: string;
  title: string;
  body: string;
  deepLink: string;
  scheduledFor: string;
  readAt: string | null;
  pushStatus: NotificationPushStatus;
  createdAt: string;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  digestEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  disabledCategories: NotificationCategory[];
}

export interface UserDeviceItem {
  id: string;
  deviceLabel: string;
  platform: "web" | "ios_pwa" | "android_pwa" | "desktop_pwa";
  hasPushSubscription: boolean;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface OutboxDeliveryItem {
  id: string;
  channel: "in_app" | "push";
  status: "pending" | "processing" | "delivered" | "failed" | "suppressed";
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface NotificationsPageData {
  canView: boolean;
  unreadCount: number;
  vapidPublicKey: string | null;
  notifications: NotificationItem[];
  preferences: NotificationPreferences;
  devices: UserDeviceItem[];
  outboxLogs: OutboxDeliveryItem[];
}
