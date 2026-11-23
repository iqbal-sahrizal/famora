import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type {
  MemoriesPageData,
  MemoryAlbumItem,
  MemoryEntryItem,
  MemoryMediaType,
  MemoryVisibility,
} from "./types";
import { canViewMemoryResource } from "./validation";

export async function getMemoriesPageData(
  familyId: string
): Promise<MemoriesPageData> {
  const denied: MemoriesPageData = {
    canView: false,
    canManage: false,
    currentMemberId: null,
    members: [],
    albums: [],
    memories: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const [{ data: perms }, { data: membersData }, { data: privacyData }] =
      await Promise.all([
        supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
        supabase
          .from("family_members")
          .select("id, user_id, display_name, role_id, family_roles!inner(role_key)")
          .eq("family_id", familyId)
          .eq("status", "active"),
        supabase
          .from("families")
          .select("privacy_settings")
          .eq("id", familyId)
          .maybeSingle<{ privacy_settings?: { allow_guest_memories?: boolean } | null }>(),
      ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const membersRaw =
      (membersData as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
        family_roles: { role_key: string }[] | { role_key: string } | null;
      }>) ?? [];

    const currentMember = membersRaw.find((m) => m.user_id === user.id);
    if (!currentMember) return denied;

    const roleKey = Array.isArray(currentMember.family_roles)
      ? currentMember.family_roles[0]?.role_key
      : currentMember.family_roles?.role_key;
    const isGuest = roleKey === "extended";
    const allowGuestMemories =
      privacyData?.privacy_settings?.allow_guest_memories ?? true;

    if (isGuest && !allowGuestMemories) {
      return denied;
    }

    const canManage = permSet.has("memories.manage");
    const memberNameMap = new Map<string, string>(
      membersRaw.map((m) => [m.id, m.display_name])
    );

    const [{ data: albumsData }, { data: itemsData }, { data: favsData }] =
      await Promise.all([
        supabase
          .from("memory_albums")
          .select(
            "id, title, description, cover_storage_path, visibility, shared_with_member_ids, event_name, event_date, created_by_member_id, created_at"
          )
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("memory_items")
          .select(
            "id, album_id, author_member_id, media_type, title, description, journal_entry, moment_date, event_label, is_important, visibility, shared_with_member_ids, storage_path, thumbnail_path, mime_type, size_bytes, width, height, created_at"
          )
          .eq("family_id", familyId)
          .is("deleted_at", null)
          .order("moment_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(120),
        supabase
          .from("memory_favorites")
          .select("memory_id, member_id")
          .eq("family_id", familyId),
      ]);

    const visibleAlbumsRaw = (
      (albumsData as Array<{
        id: string;
        title: string;
        description: string;
        cover_storage_path: string | null;
        visibility: MemoryVisibility;
        shared_with_member_ids: string[] | null;
        event_name: string;
        event_date: string | null;
        created_by_member_id: string | null;
        created_at: string;
      }>) ?? []
    ).filter((a) =>
      canViewMemoryResource({
        visibility: a.visibility,
        ownerMemberId: a.created_by_member_id,
        sharedWithMemberIds: a.shared_with_member_ids ?? [],
        viewerMemberId: currentMember.id,
        canManageMemories: canManage,
        isGuest,
        allowGuestMemories,
      })
    );

    const visibleItemsRaw = (
      (itemsData as Array<{
        id: string;
        album_id: string | null;
        author_member_id: string | null;
        media_type: MemoryMediaType;
        title: string;
        description: string;
        journal_entry: string;
        moment_date: string;
        event_label: string;
        is_important: boolean;
        visibility: MemoryVisibility;
        shared_with_member_ids: string[] | null;
        storage_path: string | null;
        thumbnail_path: string | null;
        mime_type: string | null;
        size_bytes: number | null;
        width: number | null;
        height: number | null;
        created_at: string;
      }>) ?? []
    ).filter((item) =>
      canViewMemoryResource({
        visibility: item.visibility,
        ownerMemberId: item.author_member_id,
        sharedWithMemberIds: item.shared_with_member_ids ?? [],
        viewerMemberId: currentMember.id,
        canManageMemories: canManage,
        isGuest,
        allowGuestMemories,
      })
    );

    // Collect storage paths for batch signed URL creation (thumbnails + covers)
    const pathsToSign = new Set<string>();
    for (const item of visibleItemsRaw) {
      if (item.thumbnail_path) pathsToSign.add(item.thumbnail_path);
      else if (item.storage_path && item.media_type === "photo") {
        pathsToSign.add(item.storage_path);
      }
    }
    for (const album of visibleAlbumsRaw) {
      if (album.cover_storage_path) pathsToSign.add(album.cover_storage_path);
    }

    const signedUrlMap = new Map<string, string>();
    const pathList = Array.from(pathsToSign);
    if (pathList.length > 0) {
      const { data: signed } = await supabase.storage
        .from("family-memories")
        .createSignedUrls(pathList, 180);
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) {
          signedUrlMap.set(entry.path, entry.signedUrl);
        }
      }
    }

    const favCountByMemory = new Map<string, number>();
    const myFavs = new Set<string>();
    for (const f of (favsData as Array<{ memory_id: string; member_id: string }>) ??
      []) {
      favCountByMemory.set(
        f.memory_id,
        (favCountByMemory.get(f.memory_id) ?? 0) + 1
      );
      if (f.member_id === currentMember.id) {
        myFavs.add(f.memory_id);
      }
    }

    const albumTitleMap = new Map<string, string>(
      visibleAlbumsRaw.map((a) => [a.id, a.title])
    );
    const albumCountMap = new Map<string, number>();
    const albumFallbackCoverMap = new Map<string, string>();
    for (const item of visibleItemsRaw) {
      if (item.album_id) {
        albumCountMap.set(item.album_id, (albumCountMap.get(item.album_id) ?? 0) + 1);
        if (!albumFallbackCoverMap.has(item.album_id)) {
          const thumb =
            (item.thumbnail_path && signedUrlMap.get(item.thumbnail_path)) ||
            (item.storage_path && signedUrlMap.get(item.storage_path));
          if (thumb) albumFallbackCoverMap.set(item.album_id, thumb);
        }
      }
    }

    const albums: MemoryAlbumItem[] = visibleAlbumsRaw.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      visibility: a.visibility,
      sharedWithMemberIds: a.shared_with_member_ids ?? [],
      eventName: a.event_name,
      eventDate: a.event_date,
      createdByMemberId: a.created_by_member_id,
      createdByName:
        (a.created_by_member_id && memberNameMap.get(a.created_by_member_id)) ||
        "Family member",
      coverUrl:
        (a.cover_storage_path && signedUrlMap.get(a.cover_storage_path)) ||
        albumFallbackCoverMap.get(a.id) ||
        null,
      itemCount: albumCountMap.get(a.id) ?? 0,
      createdAt: a.created_at,
    }));

    const memories: MemoryEntryItem[] = visibleItemsRaw.map((item) => {
      const thumbPath = item.thumbnail_path ?? item.storage_path;
      return {
        id: item.id,
        albumId: item.album_id,
        albumTitle: item.album_id ? albumTitleMap.get(item.album_id) ?? null : null,
        authorMemberId: item.author_member_id,
        authorName:
          (item.author_member_id && memberNameMap.get(item.author_member_id)) ||
          "Family member",
        mediaType: item.media_type,
        title: item.title,
        description: item.description,
        journalEntry: item.journal_entry,
        momentDate: item.moment_date,
        eventLabel: item.event_label,
        isImportant: item.is_important,
        visibility: item.visibility,
        sharedWithMemberIds: item.shared_with_member_ids ?? [],
        storagePath: item.storage_path,
        thumbnailUrl: thumbPath ? signedUrlMap.get(thumbPath) ?? null : null,
        mediaUrl: item.storage_path ? signedUrlMap.get(item.storage_path) ?? null : null,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
        width: item.width,
        height: item.height,
        isFavorite: myFavs.has(item.id),
        favoriteCount: favCountByMemory.get(item.id) ?? 0,
        createdAt: item.created_at,
      };
    });

    return {
      canView: true,
      canManage,
      currentMemberId: currentMember.id,
      members: membersRaw.map((m) => ({
        id: m.id,
        displayName: m.display_name,
      })),
      albums,
      memories,
    };
  } catch {
    return denied;
  }
}
