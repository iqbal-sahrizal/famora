export type MemoryVisibility = "family" | "adults_only" | "shared" | "private";
export type MemoryMediaType = "photo" | "video" | "journal";

export interface MemoryAlbumItem {
  id: string;
  title: string;
  description: string;
  visibility: MemoryVisibility;
  sharedWithMemberIds: string[];
  eventName: string;
  eventDate: string | null;
  createdByMemberId: string | null;
  createdByName: string;
  coverUrl: string | null;
  itemCount: number;
  createdAt: string;
}

export interface MemoryEntryItem {
  id: string;
  albumId: string | null;
  albumTitle: string | null;
  authorMemberId: string | null;
  authorName: string;
  mediaType: MemoryMediaType;
  title: string;
  description: string;
  journalEntry: string;
  momentDate: string;
  eventLabel: string;
  isImportant: boolean;
  visibility: MemoryVisibility;
  sharedWithMemberIds: string[];
  storagePath: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  isFavorite: boolean;
  favoriteCount: number;
  createdAt: string;
}

export interface MemoriesPageData {
  canView: boolean;
  canManage: boolean;
  currentMemberId: string | null;
  members: Array<{ id: string; displayName: string }>;
  albums: MemoryAlbumItem[];
  memories: MemoryEntryItem[];
}
