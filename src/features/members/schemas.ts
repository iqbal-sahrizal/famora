import { z } from "zod";

export const inviteMemberSchema = z.object({
  familyId: z.string().uuid("Invalid family ID."),
  email: z.string().trim().email("Enter a valid email address."),
  roleKey: z.enum(["admin", "adult", "teen", "child", "extended", "caregiver"]),
});

export const updateMemberRoleSchema = z.object({
  familyId: z.string().uuid(),
  memberId: z.string().uuid(),
  roleKey: z.enum(["admin", "adult", "teen", "child", "extended", "caregiver"]),
});

export const updateMemberStatusSchema = z.object({
  familyId: z.string().uuid(),
  memberId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export const memberTargetSchema = z.object({
  familyId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const invitationTargetSchema = z.object({
  familyId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
