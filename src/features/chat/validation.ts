import { z } from "zod";

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_CHAT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_CHAT_FILE_MIME_TYPES = new Set([
  ...ALLOWED_CHAT_IMAGE_MIME_TYPES,
  "application/pdf",
  "text/plain",
]);

export function isChatImageMimeType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && ALLOWED_CHAT_IMAGE_MIME_TYPES.has(mimeType));
}

export function sanitizeChatFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "attachment";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "attachment";
}

export function validateChatAttachment(params: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; error?: string; safeName?: string } {
  if (!ALLOWED_CHAT_FILE_MIME_TYPES.has(params.type)) {
    return {
      valid: false,
      error: "Unsupported attachment type. Allowed: JPEG, PNG, WebP, GIF, PDF, or TXT.",
    };
  }
  if (params.size <= 0 || params.size > MAX_CHAT_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: "Attachment size must be between 1 byte and 10 MB.",
    };
  }
  return {
    valid: true,
    safeName: sanitizeChatFilename(params.name),
  };
}

export const sendMessageMetaSchema = z.object({
  familyId: z.string().uuid(),
  conversationId: z.string().uuid(),
  body: z.string().trim().max(4000).default(""),
  clientNonce: z.string().uuid(),
  replyToMessageId: z.string().uuid().nullable().default(null),
});

export const editMessageSchema = z.object({
  familyId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  body: z.string().trim().min(1, "Message cannot be empty.").max(4000),
});
