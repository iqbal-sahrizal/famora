import { describe, expect, it } from "vitest";
import {
  ALL_NOTIFICATION_CATEGORIES,
  evaluateDeliveryDecision,
  fcmDeviceRegistrationSchema,
  validateNotificationDeepLink,
} from "../logic";
import { isUnregisteredFcmError, loadFcmServiceAccount } from "../fcm";
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

describe("Senvamily FCM & Push Notification Safety", () => {
  it("supports system_update and app_update categories", () => {
    expect(ALL_NOTIFICATION_CATEGORIES).toContain("system_update");
    expect(ALL_NOTIFICATION_CATEGORIES).toContain("app_update");
  });

  it("validates FCM device registration payloads strictly", () => {
    const valid = fcmDeviceRegistrationSchema.safeParse({
      deviceLabel: "Pixel 8",
      deviceFingerprint: "and_1234567890abcdef",
      fcmToken: "fcm_token_example_1234567890abcdef",
      appVersionCode: 2,
      appVersionName: "1.1.0",
    });
    expect(valid.success).toBe(true);

    const invalid = fcmDeviceRegistrationSchema.safeParse({
      deviceFingerprint: "short",
      fcmToken: "tiny",
    });
    expect(invalid.success).toBe(false);
  });

  it("prevents open redirects on notification deep links", () => {
    expect(validateNotificationDeepLink("/f/abc-123/tasks")).toBe("/f/abc-123/tasks");
    expect(validateNotificationDeepLink("/?update=1")).toBe("/?update=1");
    expect(validateNotificationDeepLink("https://evil.example/phish")).toBe("/");
    expect(validateNotificationDeepLink("//evil.example/phish")).toBe("/");
    expect(validateNotificationDeepLink("/ok\r\nSet-Cookie: bad=1")).toBe("/");
  });

  it("respects quiet hours and disabled categories while allowing mandatory updates", () => {
    const quietTime = new Date("2026-11-24T23:30:00Z");

    expect(
      evaluateDeliveryDecision({
        channel: "push",
        category: "shopping",
        preferences: BASE_PREFS,
        nowDate: quietTime,
      })
    ).toEqual({ deliver: false, reason: "suppressed_preference" });

    expect(
      evaluateDeliveryDecision({
        channel: "push",
        category: "task_assignment",
        preferences: BASE_PREFS,
        nowDate: quietTime,
      })
    ).toEqual({ deliver: false, reason: "suppressed_quiet_hours" });

    expect(
      evaluateDeliveryDecision({
        channel: "push",
        category: "app_update",
        preferences: BASE_PREFS,
        nowDate: quietTime,
        isMandatory: true,
      })
    ).toEqual({ deliver: true });
  });

  it("detects unregistered FCM tokens and handles missing credentials safely", () => {
    expect(isUnregisteredFcmError(404, "")).toBe(true);
    expect(isUnregisteredFcmError(410, "")).toBe(true);
    expect(isUnregisteredFcmError(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(
      true
    );
    expect(isUnregisteredFcmError(500, "INTERNAL")).toBe(false);

    const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(loadFcmServiceAccount()).toBeNull();
    if (prevJson !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
  });
});
