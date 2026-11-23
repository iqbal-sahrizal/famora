import { z } from "zod";

export const createAnnouncementSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(2, "Title is required.").max(140),
  body: z.string().trim().min(2, "Announcement message is required.").max(1000),
  audience: z.enum(["all", "adults_only", "children_teens"]).default("all"),
  pinned: z.boolean().default(false),
  attachmentName: z.string().trim().max(160).optional(),
});

export const updateAnnouncementSchema = z.object({
  familyId: z.string().uuid(),
  announcementId: z.string().uuid(),
  title: z.string().trim().min(2, "Title is required.").max(140),
  body: z.string().trim().min(2, "Announcement message is required.").max(1000),
  audience: z.enum(["all", "adults_only", "children_teens"]).default("all"),
  pinned: z.boolean().default(false),
});

export const deleteAnnouncementSchema = z.object({
  familyId: z.string().uuid(),
  announcementId: z.string().uuid(),
});

export const createPollSchema = z.object({
  familyId: z.string().uuid(),
  question: z.string().trim().min(3, "Question is required.").max(240),
  description: z.string().trim().max(600).default(""),
  options: z
    .array(z.string().trim().min(1).max(120))
    .min(2, "Add at least 2 options.")
    .max(8, "Maximum 8 options."),
  allowMultiple: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  allowVoteEdit: z.boolean().default(true),
  visibility: z.enum(["family", "adults_only"]).default("family"),
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
});

export const castVoteSchema = z.object({
  familyId: z.string().uuid(),
  pollId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).min(1, "Select at least one option."),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type DeleteAnnouncementInput = z.infer<typeof deleteAnnouncementSchema>;
export type CreatePollInput = z.infer<typeof createPollSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
