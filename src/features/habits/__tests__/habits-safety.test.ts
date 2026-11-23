import { describe, expect, it } from "vitest";
import { computeGentleConsistency } from "../validation";
import {
  canViewLocationShare,
  enableLocationShareSchema,
} from "../../safety/validation";

describe("Habits & Family Safety — Privacy, Consent & Progress", () => {
  it("computes gentle 7-day habit consistency without punitive streak resets", () => {
    const res = computeGentleConsistency({
      completedDates: ["2026-11-16", "2026-11-18", "2026-11-20", "2026-11-22"],
      windowDays: 7,
      todayIso: "2026-11-22",
    });

    expect(res.recentDays).toHaveLength(7);
    expect(res.completionRatePct).toBe(57);
  });

  it("rejects location sharing without explicit consent or without selected viewers", () => {
    const noConsent = enableLocationShareSchema.safeParse({
      familyId: "11111111-1111-4111-8111-111111111111",
      consentAcknowledged: false,
      expiresInMinutes: 60,
      sharedWithMemberIds: ["22222222-2222-4222-8222-222222222222"],
      approximateArea: "Central Park",
    });
    expect(noConsent.success).toBe(false);

    const noViewers = enableLocationShareSchema.safeParse({
      familyId: "11111111-1111-4111-8111-111111111111",
      consentAcknowledged: true,
      expiresInMinutes: 60,
      sharedWithMemberIds: [],
      approximateArea: "Central Park",
    });
    expect(noViewers.success).toBe(false);
  });

  it("enforces consensual, participant-only, time-limited, and revocable location visibility", () => {
    const nowMs = new Date("2026-11-22T12:00:00.000Z").getTime();

    // Active, consented, unexpired, listed participant -> allowed
    expect(
      canViewLocationShare({
        ownerMemberId: "mem-1",
        viewerMemberId: "mem-2",
        isEnabled: true,
        consentAcknowledgedAt: "2026-11-22T11:30:00.000Z",
        expiresAt: "2026-11-22T13:00:00.000Z",
        revokedAt: null,
        sharedWithMemberIds: ["mem-2"],
        nowMs,
      })
    ).toBe(true);

    // Unlisted family member -> blocked
    expect(
      canViewLocationShare({
        ownerMemberId: "mem-1",
        viewerMemberId: "mem-3",
        isEnabled: true,
        consentAcknowledgedAt: "2026-11-22T11:30:00.000Z",
        expiresAt: "2026-11-22T13:00:00.000Z",
        revokedAt: null,
        sharedWithMemberIds: ["mem-2"],
        nowMs,
      })
    ).toBe(false);

    // Revoked share -> blocked
    expect(
      canViewLocationShare({
        ownerMemberId: "mem-1",
        viewerMemberId: "mem-2",
        isEnabled: true,
        consentAcknowledgedAt: "2026-11-22T11:30:00.000Z",
        expiresAt: "2026-11-22T13:00:00.000Z",
        revokedAt: "2026-11-22T11:45:00.000Z",
        sharedWithMemberIds: ["mem-2"],
        nowMs,
      })
    ).toBe(false);

    // Expired share -> blocked
    expect(
      canViewLocationShare({
        ownerMemberId: "mem-1",
        viewerMemberId: "mem-2",
        isEnabled: true,
        consentAcknowledgedAt: "2026-11-22T10:00:00.000Z",
        expiresAt: "2026-11-22T11:59:00.000Z",
        revokedAt: null,
        sharedWithMemberIds: ["mem-2"],
        nowMs,
      })
    ).toBe(false);
  });
});
