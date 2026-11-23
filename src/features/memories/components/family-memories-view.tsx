"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Film,
  FolderHeart,
  Heart,
  Image as ImageIcon,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toIntlLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  createAlbumAction,
  createMemoryAction,
  deleteMemoryAction,
  getMemorySignedUrlAction,
  toggleMemoryFavoriteAction,
  updateAlbumSharingAction,
  updateMemoryAction,
} from "../actions";
import { optimizePhotoForUpload } from "../image-client";
import type {
  MemoriesPageData,
  MemoryAlbumItem,
  MemoryEntryItem,
  MemoryMediaType,
  MemoryVisibility,
} from "../types";
import { runWithUploadRetry, validateMemoryMediaFile } from "../validation";

type FilterTab = "all" | "journals" | "important" | "favorites";

const VISIBILITY_KEYS: Record<
  MemoryVisibility,
  Parameters<ReturnType<typeof useLocale>["t"]>[0]
> = {
  family: "memories.visibility.family",
  shared: "memories.visibility.shared",
  adults_only: "memories.visibility.adults_only",
  private: "memories.visibility.private",
};

function formatMonthHeading(dateStr: string, locale: Locale): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(toIntlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDayLabel(dateStr: string, locale: Locale): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(toIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function FamilyMemoriesView({
  familyId,
  data,
}: {
  familyId: string;
  data: MemoriesPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<FilterTab>("all");
  const [selectedAlbumId, setSelectedAlbumId] = React.useState<string | null>(
    null
  );

  // Viewer modal state
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const [viewerSignedUrl, setViewerSignedUrl] = React.useState<string | null>(
    null
  );
  const [viewerError, setViewerError] = React.useState(false);

  // Upload / Create Memory sheet
  const [addMemoryOpen, setAddMemoryOpen] = React.useState(false);
  const [mediaType, setMediaType] = React.useState<MemoryMediaType>("photo");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [journalEntry, setJournalEntry] = React.useState("");
  const [momentDate, setMomentDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [eventLabel, setEventLabel] = React.useState("");
  const [albumId, setAlbumId] = React.useState("");
  const [visibility, setVisibility] = React.useState<MemoryVisibility>("family");
  const [isImportant, setIsImportant] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadFailed, setUploadFailed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // New Album sheet
  const [newAlbumOpen, setNewAlbumOpen] = React.useState(false);
  const [albumTitle, setAlbumTitle] = React.useState("");
  const [albumDesc, setAlbumDesc] = React.useState("");
  const [albumEvent, setAlbumEvent] = React.useState("");
  const [albumVisibility, setAlbumVisibility] =
    React.useState<MemoryVisibility>("family");

  // Album sharing sheet
  const [sharingAlbum, setSharingAlbum] = React.useState<MemoryAlbumItem | null>(
    null
  );
  const [shareVisibility, setShareVisibility] =
    React.useState<MemoryVisibility>("family");
  const [shareMemberIds, setShareMemberIds] = React.useState<string[]>([]);

  // Edit memory description sheet
  const [editMemoryItem, setEditMemoryItem] =
    React.useState<MemoryEntryItem | null>(null);
  const [editMemTitle, setEditMemTitle] = React.useState("");
  const [editMemDesc, setEditMemDesc] = React.useState("");
  const [editMemJournal, setEditMemJournal] = React.useState("");
  const [editMemEvent, setEditMemEvent] = React.useState("");
  const [editMemImportant, setEditMemImportant] = React.useState(false);
  const [savingMemEdit, setSavingMemEdit] = React.useState(false);

  const openEditMemory = (item: MemoryEntryItem) => {
    setEditMemoryItem(item);
    setEditMemTitle(item.title);
    setEditMemDesc(item.description);
    setEditMemJournal(item.journalEntry);
    setEditMemEvent(item.eventLabel);
    setEditMemImportant(item.isImportant);
  };

  const handleUpdateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMemoryItem) return;
    setSavingMemEdit(true);
    const res = await updateMemoryAction({
      familyId,
      memoryId: editMemoryItem.id,
      title: editMemTitle,
      description: editMemDesc,
      journalEntry:
        editMemoryItem.mediaType === "journal" ? editMemJournal : undefined,
      eventLabel: editMemEvent,
      isImportant: editMemImportant,
    });
    setSavingMemEdit(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("memories.toast.updated"));
    setEditMemoryItem(null);
    router.refresh();
  };

  const filteredMemories = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.memories.filter((m) => {
      if (selectedAlbumId && m.albumId !== selectedAlbumId) return false;
      if (tab === "journals" && m.mediaType !== "journal") return false;
      if (tab === "important" && !m.isImportant) return false;
      if (tab === "favorites" && !m.isFavorite) return false;
      if (q) {
        const hay = `${m.title} ${m.description} ${m.journalEntry} ${m.eventLabel} ${m.albumTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.memories, search, tab, selectedAlbumId]);

  const timelineGroups = React.useMemo(() => {
    const map = new Map<string, MemoryEntryItem[]>();
    for (const m of filteredMemories) {
      const month = formatMonthHeading(m.momentDate, locale);
      const list = map.get(month) ?? [];
      list.push(m);
      map.set(month, list);
    }
    return Array.from(map.entries());
  }, [filteredMemories, locale]);

  const activeViewerItem =
    viewerIndex !== null ? filteredMemories[viewerIndex] ?? null : null;

  const loadSignedViewerMedia = React.useCallback(
    async (item: MemoryEntryItem) => {
      setViewerError(false);
      setViewerSignedUrl(item.mediaUrl ?? item.thumbnailUrl ?? null);
      if (!item.storagePath) return;
      const res = await getMemorySignedUrlAction({
        familyId,
        memoryId: item.id,
      });
      if (res.ok && res.signedUrl) {
        setViewerSignedUrl(res.signedUrl);
      } else if (!item.mediaUrl && !item.thumbnailUrl) {
        setViewerError(true);
      }
    },
    [familyId]
  );

  React.useEffect(() => {
    if (!activeViewerItem) return;
    void loadSignedViewerMedia(activeViewerItem);
  }, [activeViewerItem, loadSignedViewerMedia]);

  React.useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerIndex(null);
      if (e.key === "ArrowRight") {
        setViewerIndex((i) =>
          i !== null && i < filteredMemories.length - 1 ? i + 1 : i
        );
      }
      if (e.key === "ArrowLeft") {
        setViewerIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, filteredMemories.length]);

  if (!data.canView) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t("memories.restrictedTitle")}
          description={t("memories.restrictedDesc")}
        />
      </Card>
    );
  }

  const handleSaveMemory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      toast.error(t("memories.toast.titleRequired"));
      return;
    }

    if (mediaType !== "journal") {
      if (!selectedFile) {
        toast.error(t("memories.toast.mediaRequired"));
        return;
      }
      const check = validateMemoryMediaFile({
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      });
      if (!check.valid) {
        toast.error(te(check.error));
        return;
      }
    }

    setSubmitting(true);
    setUploadFailed(false);

    try {
      let uploadFile = selectedFile;
      let thumbFile: File | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (mediaType === "photo" && selectedFile) {
        const optimized = await optimizePhotoForUpload(selectedFile);
        uploadFile = optimized.optimizedFile;
        thumbFile = optimized.thumbnailFile;
        width = optimized.width;
        height = optimized.height;
      }

      const result = await runWithUploadRetry(async () => {
        const fd = new FormData();
        fd.set("familyId", familyId);
        if (albumId) fd.set("albumId", albumId);
        fd.set("mediaType", mediaType);
        fd.set("title", title.trim());
        fd.set("description", description.trim());
        fd.set("journalEntry", journalEntry.trim());
        fd.set("momentDate", momentDate);
        fd.set("eventLabel", eventLabel.trim());
        fd.set("isImportant", String(isImportant));
        fd.set("visibility", visibility);
        if (width) fd.set("width", String(width));
        if (height) fd.set("height", String(height));
        if (uploadFile) fd.set("file", uploadFile);
        if (thumbFile) fd.set("thumbnail", thumbFile);

        const res = await createMemoryAction(fd);
        if (!res.ok) {
          throw new Error(res.error ?? "Upload failed.");
        }
        return res;
      }, 2);

      if (result.ok) {
        toast.success(t("memories.toast.added"));
        setAddMemoryOpen(false);
        setTitle("");
        setDescription("");
        setJournalEntry("");
        setEventLabel("");
        setSelectedFile(null);
        setIsImportant(false);
        router.refresh();
      }
    } catch (err) {
      setUploadFailed(true);
      toast.error(
        err instanceof Error
          ? err.message
          : "Upload failed. You can safely retry."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createAlbumAction({
      familyId,
      title: albumTitle,
      description: albumDesc,
      eventName: albumEvent,
      visibility: albumVisibility,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("memories.toast.albumCreated"));
    setNewAlbumOpen(false);
    setAlbumTitle("");
    setAlbumDesc("");
    setAlbumEvent("");
    router.refresh();
  };

  const handleSaveSharing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingAlbum) return;
    const res = await updateAlbumSharingAction({
      familyId,
      albumId: sharingAlbum.id,
      visibility: shareVisibility,
      sharedWithMemberIds: shareMemberIds,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("memories.toast.sharingUpdated"));
    setSharingAlbum(null);
    router.refresh();
  };

  const handleToggleFavorite = async (item: MemoryEntryItem) => {
    const res = await toggleMemoryFavoriteAction({
      familyId,
      memoryId: item.id,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    router.refresh();
  };

  const handleDeleteMemory = async (item: MemoryEntryItem) => {
    const res = await deleteMemoryAction({ familyId, memoryId: item.id });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setViewerIndex(null);
    toast.success(t("memories.toast.removed"));
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("memories.title")}
        description={t("memories.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data.canManage && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNewAlbumOpen(true)}
              >
                <FolderHeart className="h-4 w-4" />
                {t("memories.newAlbum")}
              </Button>
            )}
            <Button type="button" onClick={() => setAddMemoryOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("memories.addMemory")}
            </Button>
          </div>
        }
      />

      {/* Editorial Albums Strip */}
      <Section title={t("memories.curatedAlbums")}>
        {selectedAlbumId && (
          <div className="mb-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedAlbumId(null)}
            >
              {t("memories.showAll")}
            </Button>
          </div>
        )}
        {data.albums.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<FolderHeart className="h-6 w-6" />}
              title={t("memories.noAlbums")}
              description={t("memories.noAlbumsDesc")}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.albums.map((album) => {
              const selected = selectedAlbumId === album.id;
              return (
                <Card
                  key={album.id}
                  className={cn(
                    "group overflow-hidden transition-all",
                    selected && "ring-2 ring-[var(--accent-primary)]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedAlbumId(selected ? null : album.id)
                    }
                    className="block w-full text-left cursor-pointer"
                  >
                    <div className="relative h-40 w-full overflow-hidden bg-[var(--tint-sand)]">
                      {album.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={album.coverUrl}
                          alt={album.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                          <FolderHeart className="h-10 w-10 opacity-50" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent p-3.5 text-white">
                        <p className="font-heading text-[16px] font-bold leading-snug">
                          {album.title}
                        </p>
                        <p className="text-[12px] text-white/85">
                          {album.itemCount} moment{album.itemCount === 1 ? "" : "s"}
                          {album.eventName ? ` · ${album.eventName}` : ""}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between px-4 py-2.5 text-[12px]">
                    <Badge variant="neutral">
                      {t(VISIBILITY_KEYS[album.visibility])}
                    </Badge>
                    {(data.canManage ||
                      album.createdByMemberId === data.currentMemberId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSharingAlbum(album);
                          setShareVisibility(album.visibility);
                          setShareMemberIds(album.sharedWithMemberIds);
                        }}
                        className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Sharing
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* Search & Timeline Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: t("memories.tab.all") },
              { id: "important", label: t("memories.tab.important") },
              { id: "journals", label: t("memories.tab.journals") },
              { id: "favorites", label: t("memories.tab.favorites") },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                tab === item.id
                  ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("memories.searchPlaceholder")}
            className="pl-9"
          />
        </div>
      </div>

      {/* Timeline Narrative & Responsive Editorial Grid */}
      {timelineGroups.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title={t("memories.emptyTitle")}
            description={t("memories.emptyDesc")}
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {timelineGroups.map(([monthLabel, items]) => (
            <section key={monthLabel} className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-[var(--accent-primary)]" />
                <h2 className="font-heading text-[18px] font-bold">
                  {monthLabel}
                </h2>
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  {items.length} entr{items.length === 1 ? "y" : "ies"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const globalIdx = filteredMemories.findIndex(
                    (m) => m.id === item.id
                  );
                  return (
                    <Card
                      key={item.id}
                      className="flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-float)]"
                    >
                      {item.mediaType === "journal" ? (
                        <button
                          type="button"
                          onClick={() => setViewerIndex(globalIdx)}
                          className="flex flex-1 flex-col justify-between bg-[var(--tint-sand)]/45 p-5 text-left cursor-pointer"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <Badge variant="sage">
                                <BookOpen className="mr-1 h-3 w-3" />
                                Journal
                              </Badge>
                              {item.isImportant && (
                                <Badge variant="peach">Important</Badge>
                              )}
                            </div>
                            <h3 className="font-heading text-[17px] font-bold leading-snug">
                              {item.title}
                            </h3>
                            <p className="line-clamp-4 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                              {item.journalEntry || item.description}
                            </p>
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setViewerIndex(globalIdx)}
                          className="group relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-subtle)] text-left cursor-pointer"
                        >
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                              {item.mediaType === "video" ? (
                                <Film className="h-9 w-9" />
                              ) : (
                                <ImageIcon className="h-9 w-9" />
                              )}
                            </div>
                          )}

                          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                            {item.mediaType === "video" && (
                              <Badge variant="neutral">Video</Badge>
                            )}
                            {item.isImportant && (
                              <Badge variant="peach">{t("memories.importantBadge")}</Badge>
                            )}
                          </div>
                        </button>
                      )}

                      <div className="flex flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {item.mediaType !== "journal" && (
                              <h3 className="truncate font-heading text-[15.5px] font-bold">
                                {item.title}
                              </h3>
                            )}
                            <p className="text-[12px] text-[var(--text-muted)]">
                              {formatDayLabel(item.momentDate, locale)} · {item.authorName}
                              {item.eventLabel ? ` · ${item.eventLabel}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={t("memories.favAria")}
                            onClick={() => void handleToggleFavorite(item)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] cursor-pointer",
                              item.isFavorite
                                ? "bg-[var(--tint-blush)] text-[var(--tint-blush-fg)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                            )}
                          >
                            <Heart
                              className={cn(
                                "h-3.5 w-3.5",
                                item.isFavorite && "fill-current"
                              )}
                            />
                            {item.favoriteCount > 0 && (
                              <span>{item.favoriteCount}</span>
                            )}
                          </button>
                        </div>
                        {item.description && item.mediaType !== "journal" && (
                          <p className="line-clamp-2 text-[13px] text-[var(--text-secondary)]">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Immersive Lightbox Viewer */}
      {activeViewerItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-[#111412]/95 text-white backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-heading text-[16px] font-bold">
                {activeViewerItem.title}
              </p>
              <p className="text-[12px] text-white/70">
                {formatDayLabel(activeViewerItem.momentDate, locale)} ·{" "}
                {activeViewerItem.authorName}
                {activeViewerItem.eventLabel
                  ? ` · ${activeViewerItem.eventLabel}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleFavorite(activeViewerItem)}
                className="rounded-full p-2 hover:bg-white/10 cursor-pointer"
                aria-label={t("memories.toggleFavAria")}
              >
                <Heart
                  className={cn(
                    "h-5 w-5",
                    activeViewerItem.isFavorite && "fill-rose-400 text-rose-400"
                  )}
                />
              </button>
              {(activeViewerItem.authorMemberId === data.currentMemberId ||
                (data.canManage && activeViewerItem.visibility !== "private")) && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditMemory(activeViewerItem)}
                    className="rounded-full p-2 hover:bg-white/10 cursor-pointer"
                    aria-label={t("memories.editAria")}
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteMemory(activeViewerItem)}
                    className="rounded-full p-2 hover:bg-white/10 cursor-pointer"
                    aria-label={t("memories.deleteAria")}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setViewerIndex(null)}
                className="rounded-full p-2 hover:bg-white/10 cursor-pointer"
                aria-label={t("memories.closeViewerAria")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            {viewerIndex !== null && viewerIndex > 0 && (
              <button
                type="button"
                onClick={() => setViewerIndex(viewerIndex - 1)}
                className="absolute left-3 z-10 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/75 cursor-pointer"
                aria-label={t("memories.prevAria")}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {activeViewerItem.mediaType === "journal" ? (
              <div className="max-h-full max-w-2xl overflow-y-auto rounded-3xl bg-white/10 p-6 sm:p-8">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/95">
                  {activeViewerItem.journalEntry || activeViewerItem.description}
                </p>
              </div>
            ) : viewerError ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-[14px] text-white/80">
                  Could not load full-resolution media.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadSignedViewerMedia(activeViewerItem)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : activeViewerItem.mediaType === "video" && viewerSignedUrl ? (
              <video
                src={viewerSignedUrl}
                controls
                playsInline
                className="max-h-full max-w-full rounded-2xl"
              />
            ) : viewerSignedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewerSignedUrl}
                alt={activeViewerItem.title}
                onError={() => setViewerError(true)}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            ) : (
              <p className="text-[13px] text-white/70">Loading media…</p>
            )}

            {viewerIndex !== null &&
              viewerIndex < filteredMemories.length - 1 && (
                <button
                  type="button"
                  onClick={() => setViewerIndex(viewerIndex + 1)}
                  className="absolute right-3 z-10 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/75 cursor-pointer"
                  aria-label={t("memories.nextAria")}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
          </div>

          {activeViewerItem.description && (
            <div className="border-t border-white/10 px-6 py-3 text-center text-[13.5px] text-white/85">
              {activeViewerItem.description}
            </div>
          )}
        </div>
      )}

      {/* Add Memory / Journal Bottom Sheet */}
      <BottomSheet
        open={addMemoryOpen}
        onClose={() => setAddMemoryOpen(false)}
        title={t("memories.modal.captureTitle")}
      >
        <form onSubmit={handleSaveMemory} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "photo", label: t("memories.modal.mediaPhoto") },
                { id: "video", label: t("memories.modal.mediaVideo") },
                { id: "journal", label: t("memories.modal.mediaJournal") },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMediaType(opt.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-[13px] font-semibold cursor-pointer",
                  mediaType === opt.id
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("memories.titlePlaceholder")}
            required
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="date"
              value={momentDate}
              onChange={(e) => setMomentDate(e.target.value)}
              required
            />
            <Input
              value={eventLabel}
              onChange={(e) => setEventLabel(e.target.value)}
              placeholder={t("memories.eventTagPlaceholder")}
            />
          </div>

          {mediaType !== "journal" && (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-center">
              <Upload className="h-5 w-5 text-[var(--accent-primary)]" />
              <span className="text-[13px] font-medium">
                {selectedFile
                  ? selectedFile.name
                  : mediaType === "video"
                  ? t("memories.modal.selectVideo")
                  : t("memories.modal.selectPhoto")}
              </span>
              <input
                type="file"
                accept={
                  mediaType === "video"
                    ? "video/mp4,video/webm,video/quicktime"
                    : "image/jpeg,image/png,image/webp,image/gif"
                }
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          {mediaType === "journal" ? (
            <textarea
              rows={5}
              value={journalEntry}
              onChange={(e) => setJournalEntry(e.target.value)}
              placeholder={t("memories.reflectionPlaceholder")}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          ) : (
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("memories.captionPlaceholder")}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
              options={[
                { value: "", label: t("memories.modal.noAlbum") },
                ...data.albums.map((a) => ({ value: a.id, label: a.title })),
              ]}
            />

            <Select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as MemoryVisibility)}
              options={[
                { value: "family", label: t("memories.visibilityOpt.family") },
                { value: "private", label: t("memories.visibilityOpt.private") },
                ...(data.canManage
                  ? [{ value: "adults_only", label: t("memories.visibilityOpt.adults_only") }]
                  : []),
              ]}
            />
          </div>

          <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(e) => setIsImportant(e.target.checked)}
            />
            {t("memories.modal.markMilestone")}
          </label>

          {uploadFailed && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--tint-peach)] px-3 py-2 text-[12.5px] text-[var(--tint-peach-fg)]">
              <span>{t("memories.modal.uploadInterrupted")}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleSaveMemory()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("memories.modal.retryUpload")}
              </Button>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("memories.modal.saving") : t("memories.modal.saveMemory")}
          </Button>
        </form>
      </BottomSheet>

      {/* New Album Bottom Sheet */}
      <BottomSheet
        open={newAlbumOpen}
        onClose={() => setNewAlbumOpen(false)}
        title={t("memories.modal.createAlbumTitle")}
      >
        <form onSubmit={handleCreateAlbum} className="space-y-4">
          <Input
            value={albumTitle}
            onChange={(e) => setAlbumTitle(e.target.value)}
            placeholder={t("memories.albumTitlePlaceholder")}
            required
          />
          <Input
            value={albumEvent}
            onChange={(e) => setAlbumEvent(e.target.value)}
            placeholder={t("memories.albumEventPlaceholder")}
          />
          <textarea
            rows={3}
            value={albumDesc}
            onChange={(e) => setAlbumDesc(e.target.value)}
            placeholder={t("memories.albumDescPlaceholder")}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
          <Select
            value={albumVisibility}
            onChange={(e) =>
              setAlbumVisibility(e.target.value as MemoryVisibility)
            }
            options={[
              { value: "family", label: t("memories.albumVis.family") },
              { value: "adults_only", label: t("memories.visibility.adults_only") },
              { value: "private", label: t("memories.albumVis.private") },
            ]}
          />
          <Button type="submit" className="w-full">
            {t("memories.modal.createAlbumBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Album Sharing Bottom Sheet */}
      <BottomSheet
        open={Boolean(sharingAlbum)}
        onClose={() => setSharingAlbum(null)}
        title={`${t("memories.modal.sharePrefix")} "${sharingAlbum?.title ?? ""}"`}
      >
        <form onSubmit={handleSaveSharing} className="space-y-4">
          <Select
            value={shareVisibility}
            onChange={(e) =>
              setShareVisibility(e.target.value as MemoryVisibility)
            }
            options={[
              { value: "family", label: t("memories.shareVis.family") },
              { value: "shared", label: t("memories.shareVis.shared") },
              { value: "adults_only", label: t("memories.visibility.adults_only") },
              { value: "private", label: t("memories.shareVis.private") },
            ]}
          />

          {shareVisibility === "shared" && (
            <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
                <Users className="h-3.5 w-3.5" />
                Select members
              </p>
              {data.members.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-[13.5px]"
                >
                  <input
                    type="checkbox"
                    checked={shareMemberIds.includes(m.id)}
                    onChange={(e) =>
                      setShareMemberIds((prev) =>
                        e.target.checked
                          ? [...prev, m.id]
                          : prev.filter((id) => id !== m.id)
                      )
                    }
                  />
                  {m.displayName}
                </label>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full">
            Save Sharing Settings
          </Button>
        </form>
      </BottomSheet>

      {/* Edit Memory Description Bottom Sheet */}
      <BottomSheet
        open={Boolean(editMemoryItem)}
        onClose={() => setEditMemoryItem(null)}
        title={t("memories.modal.editTitle")}
      >
        <form onSubmit={handleUpdateMemory} className="space-y-4">
          <Input
            label={t("memories.modal.titleLabel")}
            required
            value={editMemTitle}
            onChange={(e) => setEditMemTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-mem-desc" className="text-[13.5px] font-medium">
              {t("memories.modal.descLabel")}
            </label>
            <textarea
              id="edit-mem-desc"
              rows={3}
              value={editMemDesc}
              onChange={(e) => setEditMemDesc(e.target.value)}
              placeholder={t("memories.editCaptionPlaceholder")}
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          {editMemoryItem?.mediaType === "journal" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-mem-journal" className="text-[13.5px] font-medium">
                {t("memories.modal.journalLabel")}
              </label>
              <textarea
                id="edit-mem-journal"
                rows={4}
                value={editMemJournal}
                onChange={(e) => setEditMemJournal(e.target.value)}
                className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
              />
            </div>
          )}
          <Input
            label={t("memories.modal.eventLabel")}
            value={editMemEvent}
            onChange={(e) => setEditMemEvent(e.target.value)}
          />
          <label className="flex items-center gap-2 text-[13.5px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={editMemImportant}
              onChange={(e) => setEditMemImportant(e.target.checked)}
              className="h-4 w-4 accent-[#315C49]"
            />
            {t("memories.modal.markImportantShort")}
          </label>
          <Button type="submit" className="w-full" isLoading={savingMemEdit}>
            {t("memories.modal.saveChanges")}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
