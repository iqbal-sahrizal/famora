"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Car,
  Download,
  Eye,
  FileLock2,
  FileText,
  FolderLock,
  GraduationCap,
  History,
  Home,
  IdCard,
  Landmark,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  deleteDocumentAction,
  getDocumentSignedUrlAction,
  uploadDocumentAction,
} from "../actions";
import type {
  DocumentCategory,
  DocumentsPageData,
  VaultDocumentItem,
} from "../server";

const CATEGORY_ICONS: Record<DocumentCategory, React.ReactNode> = {
  identity: <IdCard className="h-4 w-4" />,
  certificates: <Award className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  insurance: <ShieldAlert className="h-4 w-4" />,
  property: <Home className="h-4 w-4" />,
  vehicles: <Car className="h-4 w-4" />,
  financial: <Landmark className="h-4 w-4" />,
  other: <FileText className="h-4 w-4" />,
};

export function FamilyVaultView({
  familyId,
  data,
}: {
  familyId: string;
  data: DocumentsPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"vault" | "history">("vault");
  const [search, setSearch] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [previewDoc, setPreviewDoc] = React.useState<VaultDocumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // Upload form
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<DocumentCategory>("identity");
  const [sensitivity, setSensitivity] = React.useState<"standard" | "sensitive_vault">("standard");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  if (!data.canViewStandard && !data.canViewVault) {
    return (
      <Section>
        <PageHeader title={t("vault.title")} description={t("vault.restrictedDesc")} />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("vault.restrictedTitle")}
          description={t("vault.restrictedBody")}
        />
      </Section>
    );
  }

  const filteredDocs = data.documents.filter((d) => {
    if (catFilter !== "all" && d.category !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      !d.title.toLowerCase().includes(q) &&
      !d.notes.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error(t("vault.chooseFileErr"));
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("familyId", familyId);
    fd.set("title", title);
    fd.set("category", category);
    fd.set("sensitivity", sensitivity);
    if (expiresOn) fd.set("expiresOn", expiresOn);
    fd.set("notes", notes);
    fd.set("file", file);

    const res = await uploadDocumentAction(fd);
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setTitle("");
      setNotes("");
      setFile(null);
      setUploadOpen(false);
      toast.success(t("vault.uploadedToast"));
      router.refresh();
    }
  };

  const handleOpenPreview = async (doc: VaultDocumentItem) => {
    setBusy(true);
    const res = await getDocumentSignedUrlAction({
      familyId,
      documentId: doc.id,
      mode: "preview",
    });
    setBusy(false);
    if (!res.ok || !res.signedUrl) {
      toast.error(te(res.error));
      return;
    }
    setPreviewUrl(res.signedUrl);
    setPreviewDoc(doc);
  };

  const handleDownload = async (doc: VaultDocumentItem) => {
    const res = await getDocumentSignedUrlAction({
      familyId,
      documentId: doc.id,
      mode: "download",
    });
    if (!res.ok || !res.signedUrl) {
      toast.error(te(res.error));
      return;
    }
    window.open(res.signedUrl, "_blank", "noopener,noreferrer");
  };

  const categoryOptions = (Object.keys(CATEGORY_ICONS) as DocumentCategory[]).map((k) => ({
    value: k,
    label: t(`vault.cat.${k}` as "vault.cat.identity"),
  }));

  return (
    <Section>
      <PageHeader
        title={t("vault.title")}
        description={t("vault.desc")}
        badge={
          <Badge variant="forest">
            <FolderLock className="h-3 w-3" /> {t("vault.privateBucketBadge")}
          </Badge>
        }
        actions={
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("vault.uploadBtn")}
          </Button>
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "vault", label: t("vault.tab.documents"), badge: data.documents.length },
          { id: "history", label: t("vault.tab.history"), badge: data.history.length },
        ]}
      />

      {tab === "vault" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <Input
              placeholder={t("vault.searchPlaceholder")}
              leadingIcon={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label={t("vault.filterAria")}
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              options={[
                { value: "all", label: t("vault.allCategories") },
                ...categoryOptions,
              ]}
            />
          </div>

          {filteredDocs.length === 0 ? (
            <EmptyState
              icon={<FileLock2 className="h-5 w-5" />}
              title={t("vault.emptyTitle")}
              description={t("vault.emptyDesc")}
              actionLabel={t("vault.uploadFirstBtn")}
              onAction={() => setUploadOpen(true)}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc) => {
                const icon = CATEGORY_ICONS[doc.category];
                const catLabel = t(`vault.cat.${doc.category}` as "vault.cat.identity");
                return (
                  <Card key={doc.id} className="flex flex-col justify-between gap-4 p-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--bg-subtle)] px-2.5 py-1 text-[12px] font-medium">
                          {icon}
                          {catLabel}
                        </span>
                        <Badge
                          variant={
                            doc.sensitivity === "sensitive_vault" ? "lavender" : "neutral"
                          }
                        >
                          {doc.sensitivity === "sensitive_vault"
                            ? t("vault.sensitivity.vault")
                            : t("vault.sensitivity.standard")}
                        </Badge>
                      </div>

                      <div>
                        <CardTitle className="text-[16px]">{doc.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {t("vault.ownerMeta", {
                            owner: doc.ownerName,
                            size: Math.max(1, Math.round(doc.sizeBytes / 1024)),
                          })}
                        </CardDescription>
                      </div>

                      {doc.expiresOn && (
                        <Badge
                          variant={
                            doc.expirationState === "expired"
                              ? "danger"
                              : doc.expirationState === "expiring_soon"
                              ? "peach"
                              : "sage"
                          }
                          className="tabular-nums"
                        >
                          {doc.expirationState === "expired"
                            ? t("vault.expiredOn", { date: formatLocalizedDate(doc.expiresOn, locale) })
                            : t("vault.expiresOn", { date: formatLocalizedDate(doc.expiresOn, locale) })}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                      <Button
                        variant="tonal"
                        size="sm"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => handleOpenPreview(doc)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("vault.previewBtn")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label={t("vault.downloadAria", { title: doc.title })}
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.history.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">
              {t("vault.historyEmpty")}
            </p>
          ) : (
            data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <History className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span className="font-medium">{h.documentTitle}</span>
                  <Badge variant="neutral">{h.eventType}</Badge>
                </div>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                  {formatLocalizedDate(h.createdAt, locale)}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Upload Bottom Sheet */}
      <BottomSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t("vault.modal.uploadTitle")}
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <Input
            label={t("vault.modal.docTitle")}
            required
            placeholder={t("vault.modal.docPlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("vault.modal.category")}
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              options={categoryOptions}
            />
            <Select
              label={t("vault.modal.privacyTier")}
              value={sensitivity}
              onChange={(e) =>
                setSensitivity(e.target.value as "standard" | "sensitive_vault")
              }
              options={[
                { value: "standard", label: t("vault.modal.tierStandard") },
                ...(data.canViewVault
                  ? [{ value: "sensitive_vault", label: t("vault.modal.tierVault") }]
                  : []),
              ]}
            />
          </div>
          <Input
            label={t("vault.modal.expiresOn")}
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)]/60 p-5 text-center">
            <UploadCloud className="h-6 w-6 text-[var(--accent-primary)]" />
            <span className="text-[13.5px] font-medium">
              {file ? file.name : t("vault.modal.filePrompt")}
            </span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("vault.modal.encryptUploadBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Preview Dialog */}
      <Dialog
        open={Boolean(previewDoc)}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewUrl(null);
        }}
        title={previewDoc?.title ?? t("vault.previewTitleFallback")}
        description={t("vault.previewDesc")}
        footer={
          previewDoc && (
            <>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const r = await deleteDocumentAction({
                    familyId,
                    documentId: previewDoc.id,
                  });
                  if (r.ok) {
                    setPreviewDoc(null);
                    toast.success(t("vault.removedToast"));
                    router.refresh();
                  } else toast.error(te(r.error));
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </Button>
              <Button size="sm" onClick={() => handleDownload(previewDoc)}>
                <Download className="h-4 w-4" />
                {t("vault.downloadBtn")}
              </Button>
            </>
          )
        }
      >
        {previewUrl && previewDoc?.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={previewDoc.title}
            className="max-h-72 w-full rounded-xl object-contain"
          />
        ) : previewUrl ? (
          <iframe
            src={previewUrl}
            title={previewDoc?.title ?? "Document preview"}
            className="h-72 w-full rounded-xl border border-[var(--border-subtle)]"
          />
        ) : null}
      </Dialog>
    </Section>
  );
}
