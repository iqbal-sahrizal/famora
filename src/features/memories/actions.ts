"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import {
  canViewMemoryResource,
  createAlbumSchema,
  createMemoryMetaSchema,
  updateMemorySchema,
  validateMemoryMediaFile,
} from "./validation";
import type { MemoryVisibility } from "./types";

async function getActorContext(familyId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: perms }, { data: actor }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
  ]);

  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  return { supabase, actor, permSet };
}

export async function createAlbumAction(input: {
  familyId: string;
  title: string;
  description?: string;
  visibility?: MemoryVisibility;
  sharedWithMemberIds?: string[];
  eventName?: string;
  eventDate?: string | null;
}) {
  const parsed = createAlbumSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid album details.",
    };
  }

  const { supabase, actor, permSet } = await getActorContext(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };
  if (parsed.data.visibility !== "private" && !permSet.has("memories.manage")) {
    return { ok: false, error: "Missing permission: memories.manage" };
  }

  const { data, error } = await supabase
    .from("memory_albums")
    .insert({
      family_id: parsed.data.familyId,
      created_by_member_id: actor.id,
      title: parsed.data.title,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      shared_with_member_ids:
        parsed.data.visibility === "shared"
          ? parsed.data.sharedWithMemberIds
          : [],
      event_name: parsed.data.eventName,
      event_date: parsed.data.eventDate,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create album." };
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "memories"));
  return { ok: true, albumId: data.id };
}

export async function updateAlbumSharingAction(input: {
  familyId: string;
  albumId: string;
  visibility: MemoryVisibility;
  sharedWithMemberIds: string[];
}) {
  const { supabase, actor, permSet } = await getActorContext(input.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: album } = await supabase
    .from("memory_albums")
    .select("id, created_by_member_id")
    .eq("id", input.albumId)
    .eq("family_id", input.familyId)
    .maybeSingle<{ id: string; created_by_member_id: string | null }>();

  if (!album) return { ok: false, error: "Album not found." };
  if (album.created_by_member_id !== actor.id && !permSet.has("memories.manage")) {
    return { ok: false, error: "Not authorized to update album sharing." };
  }

  const { error } = await supabase
    .from("memory_albums")
    .update({
      visibility: input.visibility,
      shared_with_member_ids:
        input.visibility === "shared" ? input.sharedWithMemberIds : [],
    })
    .eq("id", input.albumId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(input.familyId, "memories"));
  return { ok: true };
}

export async function createMemoryAction(formData: FormData) {
  const familyIdRaw = String(formData.get("familyId") ?? "");
  const sharedRaw = String(formData.get("sharedWithMemberIds") ?? "");
  const sharedWithMemberIds = sharedRaw
    ? sharedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const parsed = createMemoryMetaSchema.safeParse({
    familyId: familyIdRaw,
    albumId: formData.get("albumId") ? String(formData.get("albumId")) : null,
    mediaType: formData.get("mediaType") ?? "photo",
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    journalEntry: formData.get("journalEntry") ?? "",
    momentDate: formData.get("momentDate"),
    eventLabel: formData.get("eventLabel") ?? "",
    isImportant: formData.get("isImportant") === "true",
    visibility: formData.get("visibility") ?? "family",
    sharedWithMemberIds,
    width: formData.get("width") ? Number(formData.get("width")) : null,
    height: formData.get("height") ? Number(formData.get("height")) : null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid memory details.",
    };
  }

  const { supabase, actor, permSet } = await getActorContext(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const requiresManage =
    parsed.data.mediaType !== "journal" && parsed.data.visibility !== "private";
  if (requiresManage && !permSet.has("memories.manage")) {
    return { ok: false, error: "Missing permission: memories.manage" };
  }

  const file = formData.get("file");
  const thumbnailFile = formData.get("thumbnail");

  let storagePath: string | null = null;
  let thumbnailPath: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;

  if (parsed.data.mediaType !== "journal") {
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Select a photo or video to upload." };
    }
    const check = validateMemoryMediaFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!check.valid || !check.safeName) {
      return { ok: false, error: check.error ?? "Invalid media file." };
    }

    const basePrefix = `${parsed.data.familyId}/${actor.id}/${crypto.randomUUID()}`;
    storagePath = `${basePrefix}-${check.safeName}`;
    mimeType = file.type;
    sizeBytes = file.size;

    const { error: uploadErr } = await supabase.storage
      .from("family-memories")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return { ok: false, error: uploadErr.message };
    }

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      thumbnailPath = `${basePrefix}-thumb.webp`;
      const { error: thumbErr } = await supabase.storage
        .from("family-memories")
        .upload(thumbnailPath, thumbnailFile, {
          contentType: thumbnailFile.type || "image/webp",
          upsert: false,
        });
      if (thumbErr) {
        thumbnailPath = null;
      }
    }
  }

  const { data: inserted, error: dbErr } = await supabase
    .from("memory_items")
    .insert({
      family_id: parsed.data.familyId,
      album_id: parsed.data.albumId,
      author_member_id: actor.id,
      media_type: parsed.data.mediaType,
      title: parsed.data.title,
      description: parsed.data.description,
      journal_entry: parsed.data.journalEntry,
      moment_date: parsed.data.momentDate,
      event_label: parsed.data.eventLabel,
      is_important: parsed.data.isImportant,
      visibility: parsed.data.visibility,
      shared_with_member_ids:
        parsed.data.visibility === "shared"
          ? parsed.data.sharedWithMemberIds
          : [],
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      width: parsed.data.width,
      height: parsed.data.height,
    })
    .select("id")
    .single<{ id: string }>();

  if (dbErr || !inserted) {
    const cleanupPaths = [storagePath, thumbnailPath].filter(
      (p): p is string => Boolean(p)
    );
    if (cleanupPaths.length > 0) {
      await supabase.storage.from("family-memories").remove(cleanupPaths);
    }
    return { ok: false, error: dbErr?.message ?? "Could not save memory." };
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "memories"));
  return { ok: true, memoryId: inserted.id };
}

export async function toggleMemoryFavoriteAction(input: {
  familyId: string;
  memoryId: string;
}) {
  const { supabase, actor } = await getActorContext(input.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: existing } = await supabase
    .from("memory_favorites")
    .select("id")
    .eq("memory_id", input.memoryId)
    .eq("member_id", actor.id)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await supabase
      .from("memory_favorites")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(input.familyId, "memories"));
    return { ok: true, favorited: false };
  }

  const { error } = await supabase.from("memory_favorites").insert({
    family_id: input.familyId,
    memory_id: input.memoryId,
    member_id: actor.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(input.familyId, "memories"));
  return { ok: true, favorited: true };
}

export async function deleteMemoryAction(input: {
  familyId: string;
  memoryId: string;
}) {
  const { supabase, actor, permSet } = await getActorContext(input.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: item } = await supabase
    .from("memory_items")
    .select("id, author_member_id, visibility, storage_path, thumbnail_path")
    .eq("id", input.memoryId)
    .eq("family_id", input.familyId)
    .maybeSingle<{
      id: string;
      author_member_id: string | null;
      visibility: MemoryVisibility;
      storage_path: string | null;
      thumbnail_path: string | null;
    }>();

  if (!item) return { ok: false, error: "Memory not found." };
  const isOwner = item.author_member_id === actor.id;
  if (!isOwner && (item.visibility === "private" || !permSet.has("memories.manage"))) {
    return { ok: false, error: "Not authorized to delete this memory." };
  }

  const { error } = await supabase
    .from("memory_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", item.id);

  if (error) return { ok: false, error: error.message };

  const paths = [item.storage_path, item.thumbnail_path].filter(
    (p): p is string => Boolean(p)
  );
  if (paths.length > 0) {
    await supabase.storage.from("family-memories").remove(paths);
  }

  revalidatePath(routes.familyDomain(input.familyId, "memories"));
  return { ok: true };
}

export async function updateMemoryAction(input: {
  familyId: string;
  memoryId: string;
  title: string;
  description?: string;
  journalEntry?: string;
  eventLabel?: string;
  isImportant?: boolean;
}) {
  const parsed = updateMemorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid memory details.",
    };
  }

  const { supabase, actor, permSet } = await getActorContext(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: item, error: fetchError } = await supabase
    .from("memory_items")
    .select("id, author_member_id, visibility")
    .eq("id", parsed.data.memoryId)
    .eq("family_id", parsed.data.familyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      author_member_id: string | null;
      visibility: MemoryVisibility;
    }>();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!item) return { ok: false, error: "Memory not found." };

  const isOwner = item.author_member_id === actor.id;
  if (!isOwner && (item.visibility === "private" || !permSet.has("memories.manage"))) {
    return { ok: false, error: "Not authorized to edit this memory." };
  }

  const updatePayload: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description,
    event_label: parsed.data.eventLabel,
    is_important: parsed.data.isImportant,
  };
  if (parsed.data.journalEntry !== undefined) {
    updatePayload.journal_entry = parsed.data.journalEntry;
  }

  const { error } = await supabase
    .from("memory_items")
    .update(updatePayload)
    .eq("id", item.id)
    .eq("family_id", parsed.data.familyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "memories"));
  return { ok: true };
}

export async function getMemorySignedUrlAction(input: {
  familyId: string;
  memoryId: string;
}) {
  const { supabase, actor, permSet } = await getActorContext(input.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: item } = await supabase
    .from("memory_items")
    .select(
      "id, author_member_id, visibility, shared_with_member_ids, storage_path"
    )
    .eq("id", input.memoryId)
    .eq("family_id", input.familyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      author_member_id: string | null;
      visibility: MemoryVisibility;
      shared_with_member_ids: string[] | null;
      storage_path: string | null;
    }>();

  if (!item || !item.storage_path) {
    return { ok: false, error: "Memory media not found." };
  }

  const allowed = canViewMemoryResource({
    visibility: item.visibility,
    ownerMemberId: item.author_member_id,
    sharedWithMemberIds: item.shared_with_member_ids ?? [],
    viewerMemberId: actor.id,
    canManageMemories: permSet.has("memories.manage"),
  });
  if (!allowed) {
    return { ok: false, error: "You do not have permission to view this memory." };
  }

  const { data, error } = await supabase.storage
    .from("family-memories")
    .createSignedUrl(item.storage_path, 120);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not sign media URL." };
  }

  return { ok: true, signedUrl: data.signedUrl };
}
