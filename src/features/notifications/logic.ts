import { z } from "zod";
import type {
  NotificationCategory,
  NotificationPreferences,
} from "./types";

export const ALL_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "invitation",
  "announcement",
  "calendar",
  "task_assignment",
  "task_deadline",
  "shopping",
  "bill_reminder",
  "document_expiration",
  "chat",
  "activity",
];

const CATEGORY_GENERIC_PUSH_TITLE: Record<NotificationCategory, string> = {
  invitation: "Family Invitation",
  announcement: "New Family Announcement",
  calendar: "Calendar Reminder",
  task_assignment: "New Task Assigned",
  task_deadline: "Task Deadline Reminder",
  shopping: "Shopping List Updated",
  bill_reminder: "Household Bill Reminder",
  document_expiration: "Document Expiration Notice",
  chat: "New Family Message",
  activity: "Family Activity Update",
};

function parseHHMMToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const match = /^(\d{2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Checks whether `nowDate` falls within quiet hours.
 * Supports both same-day windows (e.g. 13:00-15:00) and overnight windows (e.g. 22:00-07:00).
 */
export function isWithinQuietHours(
  nowDate: Date,
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined
): boolean {
  const startMin = parseHHMMToMinutes(quietStart);
  const endMin = parseHHMMToMinutes(quietEnd);
  if (startMin === null || endMin === null || startMin === endMin) {
    return false;
  }

  const nowMin = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight wrap (e.g. 22:00 -> 07:00)
  return nowMin >= startMin || nowMin < endMin;
}

export function evaluateDeliveryDecision(params: {
  channel: "in_app" | "push";
  category: NotificationCategory;
  preferences: NotificationPreferences;
  nowDate: Date;
}): { deliver: boolean; reason?: "suppressed_preference" | "suppressed_quiet_hours" } {
  if (params.preferences.disabledCategories.includes(params.category)) {
    return { deliver: false, reason: "suppressed_preference" };
  }

  if (params.channel === "in_app" && !params.preferences.inAppEnabled) {
    return { deliver: false, reason: "suppressed_preference" };
  }

  if (params.channel === "push") {
    if (!params.preferences.pushEnabled) {
      return { deliver: false, reason: "suppressed_preference" };
    }
    if (
      isWithinQuietHours(
        params.nowDate,
        params.preferences.quietHoursStart,
        params.preferences.quietHoursEnd
      )
    ) {
      return { deliver: false, reason: "suppressed_quiet_hours" };
    }
  }

  return { deliver: true };
}

/**
 * Strips sensitive financial, medical, or personal details from Web Push payloads.
 * Lock-screen/push notifications only show safe generic prompts and a deep link.
 */
export function sanitizePushPayload(params: {
  category: NotificationCategory;
  title: string;
  deepLink: string;
}): { title: string; body: string; url: string } {
  const safeTitle = CATEGORY_GENERIC_PUSH_TITLE[params.category];
  // Never expose currency amounts, account numbers, or private message bodies on lock screens
  const hasSensitiveHint =
    params.category === "bill_reminder" ||
    params.category === "document_expiration" ||
    params.category === "chat" ||
    /[$€£]|Rp|USD|EUR|IDR|\d{4,}/i.test(params.title);

  return {
    title: hasSensitiveHint ? safeTitle : params.title.slice(0, 80) || safeTitle,
    body: "Open Famora to view details.",
    url: params.deepLink.startsWith("/") ? params.deepLink : "/",
  };
}

export function computeNextRetryDelaySeconds(attempts: number): number {
  const schedule = [30, 120, 600, 1800, 3600];
  const idx = Math.min(Math.max(0, attempts), schedule.length - 1);
  return schedule[idx];
}

export function isExpiredPushStatus(httpStatus: number): boolean {
  return httpStatus === 404 || httpStatus === 410;
}

export function validateNotificationRecipient(params: {
  recipientFamilyId: string;
  targetFamilyId: string;
  recipientStatus: string;
}): { valid: boolean; error?: string } {
  if (params.recipientFamilyId !== params.targetFamilyId) {
    return { valid: false, error: "Recipient does not belong to this family." };
  }
  if (params.recipientStatus !== "active") {
    return { valid: false, error: "Recipient membership is not active." };
  }
  return { valid: true };
}

export const pushSubscriptionSchema = z.object({
  familyId: z.string().uuid(),
  deviceLabel: z.string().trim().min(1).max(80),
  deviceFingerprint: z.string().trim().min(8).max(160),
  platform: z
    .enum(["web", "ios_pwa", "android_pwa", "desktop_pwa"])
    .default("web"),
  endpoint: z.string().url().startsWith("https://"),
  p256dh: z.string().min(16).max(512),
  auth: z.string().min(8).max(256),
});

export const updatePreferencesSchema = z.object({
  familyId: z.string().uuid(),
  inAppEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  digestEnabled: z.boolean(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  disabledCategories: z
    .array(
      z.enum([
        "invitation",
        "announcement",
        "calendar",
        "task_assignment",
        "task_deadline",
        "shopping",
        "bill_reminder",
        "document_expiration",
        "chat",
        "activity",
      ])
    )
    .default([]),
});
