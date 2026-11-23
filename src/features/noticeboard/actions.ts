"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  castVoteSchema,
  createAnnouncementSchema,
  createPollSchema,
  deleteAnnouncementSchema,
  updateAnnouncementSchema,
  type CastVoteInput,
  type CreateAnnouncementInput,
  type CreatePollInput,
  type DeleteAnnouncementInput,
  type UpdateAnnouncementInput,
} from "./schemas";

export interface NoticeboardActionResult {
  ok: boolean;
  error?: string;
}

async function getAuthorContext(familyId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("family_members")
    .select("id, family_roles!inner(role_key)")
    .eq("family_id", familyId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const typed = data as unknown as {
    id: string;
    family_roles: { role_key: string };
  } | null;

  const roleKey = typed?.family_roles.role_key ?? null;

  return {
    supabase,
    memberId: typed?.id ?? null,
    isAdminOrOwner: roleKey === "owner" || roleKey === "admin",
    isPublisher:
      roleKey === "owner" ||
      roleKey === "admin" ||
      roleKey === "adult",
  };
}

export async function createAnnouncementAction(
  input: CreateAnnouncementInput
): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  }

  try {
    const { supabase, memberId, isPublisher } = await getAuthorContext(
      parsed.data.familyId,
      user.id
    );
    if (!memberId || !isPublisher) {
      return { ok: false, error: "Only adult household members can publish announcements." };
    }

    const { error } = await supabase.from("family_announcements").insert({
      family_id: parsed.data.familyId,
      author_member_id: memberId,
      title: parsed.data.title,
      body: parsed.data.body,
      audience: parsed.data.audience,
      pinned: parsed.data.pinned,
      attachments_jsonb: parsed.data.attachmentName
        ? [{ name: parsed.data.attachmentName }]
        : [],
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "noticeboard"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to publish announcement.",
    };
  }
}

export async function updateAnnouncementAction(
  input: UpdateAnnouncementInput
): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = updateAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  }

  try {
    const { supabase, memberId, isPublisher, isAdminOrOwner } = await getAuthorContext(
      parsed.data.familyId,
      user.id
    );
    if (!memberId || !isPublisher) {
      return { ok: false, error: "Not authorized to edit announcements." };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("family_announcements")
      .select("id, author_member_id")
      .eq("id", parsed.data.announcementId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{ id: string; author_member_id: string | null }>();

    if (fetchError) return { ok: false, error: fetchError.message };
    if (!existing) return { ok: false, error: "Announcement not found." };

    if (!isAdminOrOwner && existing.author_member_id !== memberId) {
      return {
        ok: false,
        error: "Only the author or a family admin can edit this announcement.",
      };
    }

    const { error } = await supabase
      .from("family_announcements")
      .update({
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience,
        pinned: parsed.data.pinned,
      })
      .eq("id", parsed.data.announcementId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "noticeboard"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update announcement.",
    };
  }
}

export async function deleteAnnouncementAction(
  input: DeleteAnnouncementInput
): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = deleteAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  }

  try {
    const { supabase, memberId, isPublisher, isAdminOrOwner } = await getAuthorContext(
      parsed.data.familyId,
      user.id
    );
    if (!memberId || !isPublisher) {
      return { ok: false, error: "Not authorized to delete announcements." };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("family_announcements")
      .select("id, author_member_id")
      .eq("id", parsed.data.announcementId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{ id: string; author_member_id: string | null }>();

    if (fetchError) return { ok: false, error: fetchError.message };
    if (!existing) return { ok: false, error: "Announcement not found." };

    if (!isAdminOrOwner && existing.author_member_id !== memberId) {
      return {
        ok: false,
        error: "Only the author or a family admin can delete this announcement.",
      };
    }

    const { error } = await supabase
      .from("family_announcements")
      .delete()
      .eq("id", parsed.data.announcementId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "noticeboard"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete announcement.",
    };
  }
}

export async function toggleAnnouncementArchiveAction(params: {
  familyId: string;
  announcementId: string;
  isArchived: boolean;
}): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  try {
    const { supabase, isPublisher } = await getAuthorContext(params.familyId, user.id);
    if (!isPublisher) return { ok: false, error: "Not authorized." };

    const { error } = await supabase
      .from("family_announcements")
      .update({ is_archived: params.isArchived })
      .eq("id", params.announcementId)
      .eq("family_id", params.familyId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(params.familyId, "noticeboard"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update announcement.",
    };
  }
}

export async function markAnnouncementReadAction(params: {
  familyId: string;
  announcementId: string;
}): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  try {
    const { supabase, memberId } = await getAuthorContext(params.familyId, user.id);
    if (!memberId) return { ok: false, error: "Membership not found." };

    const { error } = await supabase.from("announcement_reads").upsert(
      {
        family_id: params.familyId,
        announcement_id: params.announcementId,
        member_id: memberId,
      },
      { onConflict: "announcement_id,member_id" }
    );

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(params.familyId, "noticeboard"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to mark read.",
    };
  }
}

export async function createPollAction(
  input: CreatePollInput
): Promise<NoticeboardActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = createPollSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid poll." };
  }

  try {
    const { supabase, memberId, isPublisher } = await getAuthorContext(
      parsed.data.familyId,
      user.id
    );
    if (!memberId || !isPublisher) {
      return { ok: false, error: "Only adult household members can create polls." };
    }

    const { data: poll, error } = await supabase
      .from("family_polls")
      .insert({
        family_id: parsed.data.familyId,
        created_by_member_id: memberId,
        question: parsed.data.question,
        description: parsed.data.description,
        allow_multiple: parsed.data.allowMultiple,
        is_anonymous: parsed.data.isAnonymous,
        allow_vote_edit: parsed.data.allowVoteEdit,
        visibility: parsed.data.visibility,
        expires_at: parsed.data.expiresAt,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !poll) return { ok: false, error: error?.message ?? "Failed to create poll." };

    const { error: optError } = await supabase.from("family_poll_options").insert(
      parsed.data.options.map((label, idx) => ({
        family_id: parsed.data.familyId,
        poll_id: poll.id,
        label,
        sort_order: idx,
      }))
    );

    if (optError) return { ok: false, error: optError.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "noticeboard"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create poll.",
    };
  }
}

export async function castPollVoteAction(
  input: CastVoteInput
): Promise<NoticeboardActionResult> {
  await requireAuthenticatedUser();
  const parsed = castVoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid vote." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("cast_poll_vote", {
      p_poll_id: parsed.data.pollId,
      p_option_ids: parsed.data.optionIds,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "noticeboard"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cast vote.",
    };
  }
}
