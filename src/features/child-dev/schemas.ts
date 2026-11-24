import { z } from "zod";

export const createChildProfileSchema = z.object({
  familyId: z.string().uuid(),
  displayName: z.string().trim().min(1, "Child name is required.").max(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Valid birth date required."),
  birthPlace: z.string().trim().max(120).default(""),
  schoolName: z.string().trim().max(120).default(""),
  gradeLevel: z.string().trim().max(40).default(""),
  teacherName: z.string().trim().max(80).default(""),
});

export const addGrowthRecordSchema = z.object({
  familyId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(20, "Height must be at least 20 cm.").max(250),
  weightKg: z.number().min(0.5, "Weight must be at least 0.5 kg.").max(200),
  notes: z.string().trim().max(500).default(""),
});

export const addMilestoneSchema = z.object({
  familyId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  category: z.enum(["physical", "cognitive", "social", "academic", "activity"]),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).default(""),
  achievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photoAttachmentName: z.string().trim().max(160).nullable().default(null),
});

export const addEducationRecordSchema = z.object({
  familyId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  recordType: z.enum(["school_info", "academic_activity", "important_date"]),
  title: z.string().trim().min(1).max(140),
  details: z.string().trim().max(800).default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const addHealthRecordSchema = z.object({
  familyId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  recordType: z.enum(["immunization", "appointment", "checkup", "allergy_note"]),
  title: z.string().trim().min(1).max(140),
  providerName: z.string().trim().max(120).default(""),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(800).default(""),
});

export type CreateChildProfileInput = z.infer<typeof createChildProfileSchema>;
export type AddGrowthRecordInput = z.infer<typeof addGrowthRecordSchema>;
export type AddMilestoneInput = z.infer<typeof addMilestoneSchema>;
export type AddEducationRecordInput = z.infer<typeof addEducationRecordSchema>;
export type AddHealthRecordInput = z.infer<typeof addHealthRecordSchema>;

export const MAX_CHILD_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_CHILD_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const ALLOWED_CHILD_ATTACHMENT_EXTS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

export function sanitizeChildAttachmentFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "attachment";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "attachment";
}

export function validateChildAttachmentFile(params: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; error?: string; safeName?: string } {
  const safeName = sanitizeChildAttachmentFilename(params.name);
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";

  if (
    !ALLOWED_CHILD_ATTACHMENT_MIMES.has(params.type) ||
    !ALLOWED_CHILD_ATTACHMENT_EXTS.has(ext)
  ) {
    return {
      valid: false,
      error: "Unsupported file type. Upload PDF, JPEG, PNG, or WebP.",
    };
  }
  if (params.size <= 0 || params.size > MAX_CHILD_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: "File size must be between 1 byte and 10 MB.",
    };
  }
  return { valid: true, safeName };
}

export const uploadChildAttachmentMetaSchema = z.object({
  familyId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  recordType: z.enum(["health", "education", "milestone"]),
  notes: z.string().trim().max(500).default(""),
});

export const updateChildProfileSchema = createChildProfileSchema.extend({
  profileId: z.string().uuid(),
});

export const updateGrowthRecordSchema = addGrowthRecordSchema
  .omit({ childProfileId: true })
  .extend({ recordId: z.string().uuid() });

export const updateMilestoneSchema = addMilestoneSchema
  .omit({ childProfileId: true })
  .extend({ milestoneId: z.string().uuid() });

export const updateEducationRecordSchema = addEducationRecordSchema
  .omit({ childProfileId: true })
  .extend({ recordId: z.string().uuid() });

export const updateHealthRecordSchema = addHealthRecordSchema
  .omit({ childProfileId: true })
  .extend({ recordId: z.string().uuid() });

export const deleteChildRecordSchema = z.object({
  familyId: z.string().uuid(),
  id: z.string().uuid(),
});
