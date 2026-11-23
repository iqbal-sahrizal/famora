import { z } from "zod";

export const choreTemplateSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1, "Chore title is required.").max(140),
  description: z.string().trim().max(500).default(""),
  defaultPoints: z.number().int().min(1).max(1000).default(10),
  scheduleRule: z.enum(["daily", "weekly", "monthly", "once"]).default("daily"),
  category: z
    .enum(["kitchen", "bedroom", "outdoor", "pets", "study", "household"])
    .default("household"),
  assignedMemberId: z.string().uuid().nullable().default(null),
});

export const submitChoreSchema = z.object({
  familyId: z.string().uuid(),
  templateId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(140),
  pointsValue: z.number().int().min(1).max(1000),
  note: z.string().trim().max(500).default(""),
});

export const reviewChoreSchema = z.object({
  familyId: z.string().uuid(),
  submissionId: z.string().uuid(),
  approved: z.boolean(),
  note: z.string().trim().max(500).default(""),
});

export const rewardItemSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1, "Reward title is required.").max(120),
  description: z.string().trim().max(500).default(""),
  costPoints: z.number().int().min(1).max(10000),
});

export const familyChallengeSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(500).default(""),
  targetChores: z.number().int().min(1).max(500),
  bonusPoints: z.number().int().min(0).max(1000).default(25),
});

export type ChoreTemplateInput = z.infer<typeof choreTemplateSchema>;
export type SubmitChoreInput = z.infer<typeof submitChoreSchema>;
export type ReviewChoreInput = z.infer<typeof reviewChoreSchema>;
export type RewardItemInput = z.infer<typeof rewardItemSchema>;
export type FamilyChallengeInput = z.infer<typeof familyChallengeSchema>;
