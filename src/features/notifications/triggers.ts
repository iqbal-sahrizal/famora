import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueAndDispatchFamilyNotification } from "./outbox";
import type { NotificationCategory } from "./types";

/**
 * Notifies a single family member (non-blocking, safe against test mocks).
 */
export async function notifyFamilyMember(params: {
  familyId: string;
  recipientMemberId: string;
  excludeMemberId?: string;
  category: NotificationCategory;
  domain: string;
  title: string;
  body: string;
  deepLink: string;
  idempotencyKey: string;
}): Promise<void> {
  if (params.excludeMemberId && params.recipientMemberId === params.excludeMemberId) {
    return;
  }
  try {
    await enqueueAndDispatchFamilyNotification({
      familyId: params.familyId,
      recipientMemberId: params.recipientMemberId,
      category: params.category,
      domain: params.domain,
      title: params.title,
      body: params.body,
      deepLink: params.deepLink,
      idempotencyKey: params.idempotencyKey,
    });
  } catch {
    // Notification dispatch must never break primary mutations
  }
}

/**
 * Notifies all active family members (optionally excluding the actor) non-blockingly.
 */
export async function notifyFamilyMembers(params: {
  familyId: string;
  excludeMemberId?: string;
  onlyMemberIds?: string[];
  category: NotificationCategory;
  domain: string;
  title: string;
  body: string;
  deepLink: string;
  idempotencyPrefix: string;
}): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: members } = await supabase
      .from("family_members")
      .select("id, user_id")
      .eq("family_id", params.familyId)
      .eq("status", "active")
      .not("user_id", "is", null);

    const rows = (members as Array<{ id: string; user_id: string | null }> | null) ?? [];
    const targetSet = params.onlyMemberIds ? new Set(params.onlyMemberIds) : null;

    const recipients = rows.filter((m) => {
      if (!m.user_id) return false;
      if (params.excludeMemberId && m.id === params.excludeMemberId) return false;
      if (targetSet && !targetSet.has(m.id)) return false;
      return true;
    });

    await Promise.allSettled(
      recipients.map((r) =>
        enqueueAndDispatchFamilyNotification({
          familyId: params.familyId,
          recipientMemberId: r.id,
          category: params.category,
          domain: params.domain,
          title: params.title,
          body: params.body,
          deepLink: params.deepLink,
          idempotencyKey: `${params.idempotencyPrefix}:${r.id}`,
        })
      )
    );
  } catch {
    // Notification dispatch must never break primary mutations
  }
}
