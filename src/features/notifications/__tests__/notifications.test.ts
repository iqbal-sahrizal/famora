import { describe, expect, it } from "vitest";
import {
  computeNextRetryDelaySeconds,
  evaluateDeliveryDecision,
  isExpiredPushStatus,
  isWithinQuietHours,
  pushSubscriptionSchema,
  sanitizePushPayload,
  validateNotificationRecipient,
} from "../logic";
import type { NotificationPreferences } from "../types";

const BASE_PREFS: NotificationPreferences = {
  inAppEnabled: true,
  pushEnabled: true,
  emailEnabled: true,
  digestEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  disabledCategories: ["shopping"],
};

describe("Notification System — Push Subscriptions, Quiet Hours, Preferences & Security", () => {
  it("validates Web Push subscription creation payloads and rejects insecure endpoints", () => {
    const invalid = pushSubscriptionSchema.safeParse({
      familyId: "11111111-1111-4111-8111-111111111111",
      deviceLabel: "My Browser",
      deviceFingerprint: "web-12345678",
      platform: "web",
      endpoint: "http://insecure.example.com/push",
      p256dh: "BOr...validkeyvalue123456",
      auth: "authsecret12",
    });
    expect(invalid.success).toBe(false);

    const valid = pushSubscriptionSchema.safeParse({
      familyId: "11111111-1111-4111-8111-111111111111",
      deviceLabel: "Desktop Chrome",
      deviceFingerprint: "web-desktop-chrome-1234",
      platform: "web",
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BOr1234567890abcdef1234567890",
      auth: "authsecret12",
    });
    expect(valid.success).toBe(true);
  });

  it("blocks cross-family or inactive notification recipients", () => {
    expect(
      validateNotificationRecipient({
        recipientFamilyId: "fam-a",
        targetFamilyId: "fam-b",
        recipientStatus: "active",
      }).valid
    ).toBe(false);

    expect(
      validateNotificationRecipient({
        recipientFamilyId: "fam-a",
        targetFamilyId: "fam-a",
        recipientStatus: "suspended",
      }).valid
    ).toBe(false);

    expect(
      validateNotificationRecipient({
        recipientFamilyId: "fam-a",
        targetFamilyId: "fam-a",
        recipientStatus: "active",
      }).valid
    ).toBe(true);
  });

  it("enforces overnight quiet hours and per-category user preferences", () => {
    // 23:30 UTC is inside 22:00 -> 07:00 quiet hours
    const lateNight = new Date("2026-11-22T23:30:00.000Z");
    expect(isWithinQuietHours(lateNight, "22:00", "07:00")).toBe(true);

    const pushQuiet = evaluateDeliveryDecision({
      channel: "push",
      category: "calendar",
      preferences: BASE_PREFS,
      nowDate: lateNight,
    });
    expect(pushQuiet).toEqual({
      deliver: false,
      reason: "suppressed_quiet_hours",
    });

    // Muted category suppressed across channels
    const daytime = new Date("2026-11-22T14:00:00.000Z");
    const mutedCategory = evaluateDeliveryDecision({
      channel: "in_app",
      category: "shopping",
      preferences: BASE_PREFS,
      nowDate: daytime,
    });
    expect(mutedCategory).toEqual({
      deliver: false,
      reason: "suppressed_preference",
    });

    // Allowed category during daytime delivers
    expect(
      evaluateDeliveryDecision({
        channel: "push",
        category: "task_deadline",
        preferences: BASE_PREFS,
        nowDate: daytime,
      })
    ).toEqual({ deliver: true });
  });

  it("strips sensitive financial and personal details from Web Push payloads", () => {
    const billPush = sanitizePushPayload({
      category: "bill_reminder",
      title: "Electricity Bill $240.50 due tomorrow",
      deepLink: "/f/fam-1/budgets",
    });
    expect(billPush.title).toBe("Household Bill Reminder");
    expect(billPush.body).toBe("Open Senvamily to view details.");
    expect(billPush.title).not.toContain("240.50");

    const chatPush = sanitizePushPayload({
      category: "chat",
      title: "Mom: Private bank PIN is 4829",
      deepLink: "/f/fam-1/chat",
    });
    expect(chatPush.title).toBe("New Family Message");
    expect(chatPush.title).not.toContain("4829");
  });

  it("handles delivery failure retry backoff and expired 404/410 push subscriptions", () => {
    expect(computeNextRetryDelaySeconds(0)).toBe(30);
    expect(computeNextRetryDelaySeconds(2)).toBe(600);
    expect(isExpiredPushStatus(410)).toBe(true);
    expect(isExpiredPushStatus(404)).toBe(true);
    expect(isExpiredPushStatus(500)).toBe(false);
  });

  it("blocks protocol-relative or external deep links in sanitizePushPayload", () => {
    const protocolRelative = sanitizePushPayload({
      category: "announcement",
      title: "Family update",
      deepLink: "//evil.com/phish",
    });
    expect(protocolRelative.url).toBe("/");

    const externalUrl = sanitizePushPayload({
      category: "announcement",
      title: "Family update",
      deepLink: "https://evil.com/phish",
    });
    expect(externalUrl.url).toBe("/");
  });
});
