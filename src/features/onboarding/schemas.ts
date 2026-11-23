import { z } from "zod";

export const createFamilyStepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Family name must be at least 2 characters.")
    .max(100, "Family name must be 100 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer.")
    .optional()
    .default(""),
  avatarDataUrl: z
    .string()
    .max(600_000, "Photo is too large (max ~400 KB).")
    .optional()
    .nullable(),
});

export const familyPreferencesStepSchema = z.object({
  familyId: z.string().uuid("Invalid family ID.").optional(),
  timezone: z.string().trim().min(1, "Select a timezone."),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Select a valid 3-letter currency."),
  themeMode: z.enum(["light", "dark", "system"]).default("system"),
});

export const inviteMemberItemSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  roleKey: z.enum(["admin", "adult", "teen", "child", "extended", "caregiver"]),
});

export const acceptInviteSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, "Enter a valid invitation token."),
});

export type CreateFamilyStepInput = z.infer<typeof createFamilyStepSchema>;
export type FamilyPreferencesStepInput = z.infer<typeof familyPreferencesStepSchema>;
export type InviteMemberItem = z.infer<typeof inviteMemberItemSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
