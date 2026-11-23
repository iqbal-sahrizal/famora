import { z } from "zod";

export const updateFamilyPreferencesSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  timezone: z.string().trim().min(1),
  currencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  weekStartsOn: z.enum(["sunday", "monday"]).default("monday"),
  dateFormat: z.enum(["MMM d, yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]).default("MMM d, yyyy"),
});

export const updateFamilyPrivacySchema = z.object({
  familyId: z.string().uuid(),
  allowMemberDirectory: z.boolean(),
  requireMfaForVault: z.boolean(),
  allowGuestMemories: z.boolean(),
  childKioskEnabled: z.boolean(),
});

export const updatePersonalPreferencesSchema = z.object({
  familyId: z.string().uuid(),
  themeMode: z.enum(["light", "dark", "system"]),
  locale: z.enum(["id", "en"]).default("id"),
  digestEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});

export const updateMemberOverrideSchema = z.object({
  familyId: z.string().uuid(),
  memberId: z.string().uuid(),
  permissionKey: z.string().min(3),
  effect: z.enum(["allow", "deny", "inherit"]),
});

export const deleteFamilySchema = z.object({
  familyId: z.string().uuid(),
  confirmationName: z.string().trim().min(1, "Enter the family name to confirm."),
});

export type UpdateFamilyPreferencesInput = z.infer<typeof updateFamilyPreferencesSchema>;
export type UpdateFamilyPrivacyInput = z.infer<typeof updateFamilyPrivacySchema>;
export type UpdatePersonalPreferencesInput = z.infer<typeof updatePersonalPreferencesSchema>;
export type UpdateMemberOverrideInput = z.infer<typeof updateMemberOverrideSchema>;
export type DeleteFamilyInput = z.infer<typeof deleteFamilySchema>;
