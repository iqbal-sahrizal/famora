import crypto from "node:crypto";

/**
 * Generates a high-entropy invitation token and its SHA-256 hash.
 * Only the hash is persisted in family_invitations.token_hash.
 */
export function createInvitationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
