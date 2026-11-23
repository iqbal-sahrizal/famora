import { z } from "zod";

export const createSafetyContactSchema = z.object({
  familyId: z.string().uuid(),
  contactType: z.enum(["emergency", "trusted"]),
  name: z.string().trim().min(1, "Name is required.").max(120),
  relationship: z.string().trim().max(80).default(""),
  phone: z.string().trim().min(3, "Phone number is required.").max(40),
  email: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(600).default(""),
  isPrimary: z.boolean().default(false),
});

export const createSafetyProtocolSchema = z.object({
  familyId: z.string().uuid(),
  category: z.enum(["emergency_info", "procedure", "safety_note"]),
  title: z.string().trim().min(1, "Title is required.").max(140),
  content: z.string().trim().min(1, "Content is required.").max(4000),
});

export const enableLocationShareSchema = z.object({
  familyId: z.string().uuid(),
  consentAcknowledged: z.literal(true, {
    message: "Explicit consent is required to share your location.",
  }),
  expiresInMinutes: z.number().int().min(15).max(1440),
  sharedWithMemberIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one family member to share with."),
  statusLabel: z.string().trim().max(120).default(""),
  approximateArea: z.string().trim().min(1, "Enter your area or status.").max(160),
});

export function canViewLocationShare(params: {
  ownerMemberId: string;
  viewerMemberId: string | null;
  isEnabled: boolean;
  consentAcknowledgedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  sharedWithMemberIds: string[];
  nowMs?: number;
}): boolean {
  if (!params.viewerMemberId) return false;
  if (params.ownerMemberId === params.viewerMemberId) return true;

  if (!params.isEnabled) return false;
  if (params.revokedAt) return false;
  if (!params.consentAcknowledgedAt || !params.expiresAt) return false;

  const now = params.nowMs ?? Date.now();
  if (new Date(params.expiresAt).getTime() <= now) return false;

  return params.sharedWithMemberIds.includes(params.viewerMemberId);
}
