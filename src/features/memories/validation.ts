import { z } from "zod";
import type { MemoryVisibility } from "./types";

export const MAX_MEMORY_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_MEMORY_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MEMORY_PHOTO_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_MEMORY_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function sanitizeMemoryFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "memory";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "memory";
}

export function validateMemoryMediaFile(params: {
  name: string;
  type: string;
  size: number;
}): {
  valid: boolean;
  kind?: "photo" | "video";
  error?: string;
  safeName?: string;
} {
  const isPhoto = ALLOWED_MEMORY_PHOTO_MIMES.has(params.type);
  const isVideo = ALLOWED_MEMORY_VIDEO_MIMES.has(params.type);

  if (!isPhoto && !isVideo) {
    return {
      valid: false,
      error:
        "Unsupported media type. Upload JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.",
    };
  }

  const maxBytes = isVideo ? MAX_MEMORY_VIDEO_BYTES : MAX_MEMORY_PHOTO_BYTES;
  if (params.size <= 0 || params.size > maxBytes) {
    return {
      valid: false,
      error: isVideo
        ? "Video size must be between 1 byte and 50 MB."
        : "Photo size must be between 1 byte and 15 MB.",
    };
  }

  return {
    valid: true,
    kind: isVideo ? "video" : "photo",
    safeName: sanitizeMemoryFilename(params.name),
  };
}

export function canViewMemoryResource(params: {
  visibility: MemoryVisibility;
  ownerMemberId: string | null;
  sharedWithMemberIds: string[];
  viewerMemberId: string | null;
  canManageMemories: boolean;
  isGuest?: boolean;
  allowGuestMemories?: boolean;
}): boolean {
  if (!params.viewerMemberId) return false;
  if (params.isGuest && params.allowGuestMemories === false) {
    return false;
  }

  if (
    params.ownerMemberId &&
    params.ownerMemberId === params.viewerMemberId
  ) {
    return true;
  }

  switch (params.visibility) {
    case "family":
      return true;
    case "adults_only":
      return params.canManageMemories;
    case "shared":
      return params.sharedWithMemberIds.includes(params.viewerMemberId);
    case "private":
      return false;
    default:
      return false;
  }
}

export async function runWithUploadRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Upload failed after retries.");
}

export const createAlbumSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1, "Album title is required.").max(120),
  description: z.string().trim().max(1000).default(""),
  visibility: z.enum(["family", "adults_only", "shared", "private"]).default("family"),
  sharedWithMemberIds: z.array(z.string().uuid()).default([]),
  eventName: z.string().trim().max(120).default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const createMemoryMetaSchema = z.object({
  familyId: z.string().uuid(),
  albumId: z.string().uuid().nullable().default(null),
  mediaType: z.enum(["photo", "video", "journal"]),
  title: z.string().trim().min(1, "Title is required.").max(140),
  description: z.string().trim().max(2000).default(""),
  journalEntry: z.string().trim().max(6000).default(""),
  momentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventLabel: z.string().trim().max(100).default(""),
  isImportant: z.boolean().default(false),
  visibility: z.enum(["family", "adults_only", "shared", "private"]).default("family"),
  sharedWithMemberIds: z.array(z.string().uuid()).default([]),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
});

export const updateMemorySchema = z.object({
  familyId: z.string().uuid(),
  memoryId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required.").max(140),
  description: z.string().trim().max(2000).default(""),
  journalEntry: z.string().trim().max(6000).optional(),
  eventLabel: z.string().trim().max(100).default(""),
  isImportant: z.boolean().default(false),
});
