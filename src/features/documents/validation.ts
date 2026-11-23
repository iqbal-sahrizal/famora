export const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function sanitizeDocumentFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "document";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "document";
}

export function validateDocumentFile(params: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; error?: string; safeName?: string } {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(params.type)) {
    return {
      valid: false,
      error: "Unsupported file type. Upload PDF, JPEG, PNG, or WebP.",
    };
  }
  if (params.size <= 0 || params.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: "File size must be between 1 byte and 15 MB.",
    };
  }
  return {
    valid: true,
    safeName: sanitizeDocumentFilename(params.name),
  };
}
