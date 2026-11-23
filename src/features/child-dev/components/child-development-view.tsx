"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Baby,
  Download,
  Eye,
  GraduationCap,
  HeartPulse,
  Lock,
  Paperclip,
  Plus,
  Ruler,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { useLocale } from "@/providers/locale-provider";
import { cn } from "@/lib/utils";
import {
  addEducationRecordAction,
  addGrowthRecordAction,
  addHealthRecordAction,
  addMilestoneAction,
  createChildProfileAction,
  deleteChildAttachmentAction,
  getChildAttachmentSignedUrlAction,
  uploadChildAttachmentAction,
} from "../actions";
import type { ChildDevPageData } from "../server";

export function ChildDevelopmentView({
  familyId,
  data,
}: {
  familyId: string;
  data: ChildDevPageData;
}) {
  const router = useRouter();
  const { t, te } = useLocale();
  const [selectedChildId, setSelectedChildId] = React.useState(
    data.profiles[0]?.id ?? ""
  );
  const [tab, setTab] = React.useState<"timeline" | "growth" | "education" | "health">(
    "timeline"
  );
  const [busy, setBusy] = React.useState(false);

  const [profileOpen, setProfileOpen] = React.useState(false);
  const [milestoneOpen, setMilestoneOpen] = React.useState(false);
  const [growthOpen, setGrowthOpen] = React.useState(false);
  const [eduOpen, setEduOpen] = React.useState(false);
  const [healthOpen, setHealthOpen] = React.useState(false);
  const [attOpen, setAttOpen] = React.useState(false);
  const [attRecordType, setAttRecordType] = React.useState<"health" | "education" | "milestone">("education");
  const [attNotes, setAttNotes] = React.useState("");
  const [attFile, setAttFile] = React.useState<File | null>(null);
  const [deleteAttTarget, setDeleteAttTarget] = React.useState<ChildDevPageData["attachments"][number] | null>(null);

  // Profile form
  const [pName, setPName] = React.useState("");
  const [pBirth, setPBirth] = React.useState("2020-05-10");
  const [pSchool, setPSchool] = React.useState("");
  const [pGrade, setPGrade] = React.useState("");

  // Milestone form
  const [mTitle, setMTitle] = React.useState("");
  const [mCat, setMCat] = React.useState<"physical" | "cognitive" | "social" | "academic" | "activity">("physical");
  const [mDate, setMDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [mDesc, setMDesc] = React.useState("");
  const [mPhoto, setMPhoto] = React.useState("");

  // Growth form
  const [gDate, setGDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [gHeight, setGHeight] = React.useState("112.5");
  const [gWeight, setGWeight] = React.useState("20.2");

  // Education form
  const [eTitle, setETitle] = React.useState("");
  const [eType, setEType] = React.useState<"school_info" | "academic_activity" | "important_date">("academic_activity");
  const [eDate, setEDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [eDetails, setEDetails] = React.useState("");

  // Health form
  const [hTitle, setHTitle] = React.useState("");
  const [hType, setHType] = React.useState<"immunization" | "appointment" | "checkup" | "allergy_note">("checkup");
  const [hProvider, setHProvider] = React.useState("");
  const [hDate, setHDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [hNotes, setHNotes] = React.useState("");

  if (!data.canViewIdentity) {
    return (
      <Section>
        <PageHeader
          title={t("childDev.title")}
          description={t("childDev.subtitle")}
        />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("childDev.restrictedTitle")}
          description={t("childDev.restrictedDesc")}
        />
      </Section>
    );
  }

  const activeChild =
    data.profiles.find((p) => p.id === selectedChildId) ?? data.profiles[0] ?? null;

  const childGrowth = activeChild
    ? data.growthRecords.filter((g) => g.childProfileId === activeChild.id)
    : [];
  const childMilestones = activeChild
    ? data.milestones.filter((m) => m.childProfileId === activeChild.id)
    : [];
  const childEdu = activeChild
    ? data.educationRecords.filter((e) => e.childProfileId === activeChild.id)
    : [];
  const childHealth = activeChild
    ? data.healthRecords.filter((h) => h.childProfileId === activeChild.id)
    : [];
  const childAttachments = activeChild
    ? data.attachments.filter((a) => a.childProfileId === activeChild.id)
    : [];

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild || !attFile) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("familyId", familyId);
    fd.set("childProfileId", activeChild.id);
    fd.set("recordType", attRecordType);
    fd.set("notes", attNotes);
    fd.set("file", attFile);
    const res = await uploadChildAttachmentAction(fd);
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error, "childDev.attachments.previewError"));
      return;
    }
    setAttFile(null);
    setAttNotes("");
    setAttOpen(false);
    toast.success(t("childDev.attachments.uploadSuccess"));
    router.refresh();
  };

  const handleOpenAttachment = async (attId: string, download = false) => {
    const res = await getChildAttachmentSignedUrlAction({
      familyId,
      attachmentId: attId,
    });
    if (!res.ok || !res.signedUrl) {
      toast.error(te(res.error, "childDev.attachments.previewError"));
      return;
    }
    if (download) {
      const a = document.createElement("a");
      a.href = res.signedUrl;
      a.download = "";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } else {
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDeleteAttachment = async () => {
    if (!deleteAttTarget) return;
    setBusy(true);
    const res = await deleteChildAttachmentAction({
      familyId,
      attachmentId: deleteAttTarget.id,
    });
    setBusy(false);
    setDeleteAttTarget(null);
    if (!res.ok) {
      toast.error(te(res.error, "validation.unauthorized"));
      return;
    }
    toast.success(t("childDev.attachments.deleteSuccess"));
    router.refresh();
  };

  const maxHeight = Math.max(...childGrowth.map((g) => g.heightCm), 100);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createChildProfileAction({
      familyId,
      displayName: pName,
      birthDate: pBirth,
      birthPlace: "",
      schoolName: pSchool,
      gradeLevel: pGrade,
      teacherName: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setPName("");
      setProfileOpen(false);
      toast.success(t("childDev.toast.profileCreated"));
      router.refresh();
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild) return;
    setBusy(true);
    const res = await addMilestoneAction({
      familyId,
      childProfileId: activeChild.id,
      category: mCat,
      title: mTitle,
      description: mDesc,
      achievedOn: mDate,
      photoAttachmentName: mPhoto.trim() || null,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setMTitle("");
      setMDesc("");
      setMPhoto("");
      setMilestoneOpen(false);
      toast.success(t("childDev.toast.milestoneSaved"));
      router.refresh();
    }
  };

  const handleAddGrowth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild) return;
    setBusy(true);
    const res = await addGrowthRecordAction({
      familyId,
      childProfileId: activeChild.id,
      measuredOn: gDate,
      heightCm: Number(gHeight),
      weightKg: Number(gWeight),
      notes: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setGrowthOpen(false);
      toast.success(t("childDev.toast.growthSaved"));
      router.refresh();
    }
  };

  const handleAddEdu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild) return;
    setBusy(true);
    const res = await addEducationRecordAction({
      familyId,
      childProfileId: activeChild.id,
      recordType: eType,
      title: eTitle,
      details: eDetails,
      eventDate: eDate || null,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setETitle("");
      setEDetails("");
      setEduOpen(false);
      toast.success(t("childDev.toast.eduSaved"));
      router.refresh();
    }
  };

  const handleAddHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild) return;
    setBusy(true);
    const res = await addHealthRecordAction({
      familyId,
      childProfileId: activeChild.id,
      recordType: hType,
      title: hTitle,
      providerName: hProvider,
      recordedOn: hDate,
      notes: hNotes,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setHTitle("");
      setHNotes("");
      setHealthOpen(false);
      toast.success(t("childDev.toast.healthSaved"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("childDev.title")}
        description={t("childDev.subtitle")}
        badge={
          <Badge variant="lavender">
            <ShieldCheck className="h-3 w-3" /> {t("childDev.aiOptOutBadge")}
          </Badge>
        }
        actions={
          data.canManageGrowthMilestones ? (
            <Button size="sm" onClick={() => setProfileOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("childDev.newProfile")}
            </Button>
          ) : undefined
        }
      />

      {data.profiles.length === 0 ? (
        <EmptyState
          icon={<Baby className="h-5 w-5" />}
          title={t("childDev.emptyTitle")}
          description={t("childDev.emptyDesc")}
          actionLabel={data.canManageGrowthMilestones ? t("childDev.addProfileBtn") : undefined}
          onAction={data.canManageGrowthMilestones ? () => setProfileOpen(true) : undefined}
        />
      ) : (
        <>
          {/* Child Switcher Pills */}
          <div className="flex flex-wrap gap-2.5">
            {data.profiles.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedChildId(child.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer",
                  activeChild?.id === child.id
                    ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                    : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                )}
              >
                <Avatar name={child.displayName} size="sm" tone="peach" />
                <span>{child.displayName}</span>
              </button>
            ))}
          </div>

          {activeChild && (
            <Card variant="lavender" className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <CardTitle className="text-[22px]">{activeChild.displayName}</CardTitle>
                <CardDescription className="text-[var(--tint-lavender-fg)]">
                  {t("childDev.bornPrefix", { date: activeChild.birthDate })}
                  {activeChild.schoolName ? ` · ${activeChild.schoolName}` : ""}
                  {activeChild.gradeLevel ? ` (${activeChild.gradeLevel})` : ""}
                </CardDescription>
              </div>
              {data.canManageGrowthMilestones && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setGrowthOpen(true)}>
                    <Ruler className="h-3.5 w-3.5" />
                    {t("childDev.logGrowthBtn")}
                  </Button>
                  <Button size="sm" onClick={() => setMilestoneOpen(true)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("childDev.addMilestoneBtn")}
                  </Button>
                </div>
              )}
            </Card>
          )}

          <Tabs
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: "timeline", label: t("childDev.tab.timeline"), badge: childMilestones.length },
              { id: "growth", label: t("childDev.tab.growth"), badge: childGrowth.length },
              { id: "education", label: t("childDev.tab.education"), badge: childEdu.length },
              ...(data.canViewHealth
                ? [{ id: "health", label: t("childDev.tab.health"), badge: childHealth.length }]
                : []),
            ]}
          />

          {tab === "timeline" && (
            <div className="space-y-4">
              {childMilestones.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-5 w-5" />}
                  title={t("childDev.milestones.emptyTitle")}
                  description={t("childDev.milestones.emptyDesc")}
                />
              ) : (
                <div className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-[2px] before:bg-[var(--border-subtle)]">
                  {childMilestones.map((m) => (
                    <Card key={m.id} className="relative p-5">
                      <span className="absolute -left-6 top-6 h-3 w-3 rounded-full bg-[#E9B98B] ring-4 ring-[var(--bg-canvas)]" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="peach">{m.category}</Badge>
                        <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                          {m.achievedOn}
                        </span>
                      </div>
                      <h3 className="mt-2 font-heading text-[17px] font-semibold">
                        {m.title}
                      </h3>
                      {m.description && (
                        <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
                          {m.description}
                        </p>
                      )}
                      {m.photoAttachmentName && (
                        <Badge variant="neutral" className="mt-3">
                          <Paperclip className="h-3 w-3" /> {m.photoAttachmentName}
                        </Badge>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "growth" && (
            <Card className="space-y-6 p-6">
              <CardHeader className="mb-0">
                <div>
                  <CardTitle>{t("childDev.growth.title")}</CardTitle>
                  <CardDescription>{t("childDev.growth.desc")}</CardDescription>
                </div>
              </CardHeader>
              {childGrowth.length === 0 ? (
                <p className="text-[13.5px] text-[var(--text-secondary)]">
                  {t("childDev.growth.empty")}
                </p>
              ) : (
                <div className="flex h-48 items-end gap-4 pt-4">
                  {childGrowth.map((g) => {
                    const hPct = Math.max(15, Math.round((g.heightCm / maxHeight) * 100));
                    return (
                      <div key={g.id} className="flex flex-1 flex-col items-center gap-2">
                        <span className="text-[11px] font-semibold tabular-nums">
                          {g.heightCm} cm · {g.weightKg} kg
                        </span>
                        <div className="flex h-28 w-full items-end justify-center">
                          <div
                            style={{ height: `${hPct}%` }}
                            className="w-8 rounded-t-xl bg-[var(--tint-sage)]"
                          />
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                          {g.measuredOn}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {tab === "education" && (
            <div className="space-y-4">
              {data.canManageGrowthMilestones && (
                <Button size="sm" variant="secondary" onClick={() => setEduOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("childDev.edu.addBtn")}
                </Button>
              )}
              {childEdu.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap className="h-5 w-5" />}
                  title={t("childDev.edu.emptyTitle")}
                  description={t("childDev.edu.emptyDesc")}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {childEdu.map((ed) => (
                    <Card key={ed.id} className="space-y-2 p-5">
                      <div className="flex items-center justify-between">
                        <Badge variant="sage">{ed.recordType.replace("_", " ")}</Badge>
                        {ed.eventDate && (
                          <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                            {ed.eventDate}
                          </span>
                        )}
                      </div>
                      <CardTitle>{ed.title}</CardTitle>
                      {ed.details && <CardDescription>{ed.details}</CardDescription>}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "health" && data.canViewHealth && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--tint-blush)] px-4 py-3 text-[12.5px] text-[var(--tint-blush-fg)]">
                <span>
                  {t("childDev.health.disclaimer")}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setHealthOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("childDev.health.addBtn")}
                </Button>
              </div>
              {childHealth.length === 0 ? (
                <EmptyState
                  icon={<HeartPulse className="h-5 w-5" />}
                  title={t("childDev.health.emptyTitle")}
                  description={t("childDev.health.emptyDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {childHealth.map((h) => (
                    <Card key={h.id} className="space-y-1.5 p-5">
                      <div className="flex items-center justify-between">
                        <Badge variant="blush">{h.recordType.replace("_", " ")}</Badge>
                        <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                          {h.recordedOn}
                        </span>
                      </div>
                      <CardTitle>{h.title}</CardTitle>
                      <CardDescription>
                        {h.providerName ? `${h.providerName} · ` : ""}
                        {h.notes}
                      </CardDescription>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Private Child Attachments Section */}
          <Card className="space-y-4 p-5">
            <CardHeader className="mb-0 flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-[16px]">
                  <Paperclip className="h-4 w-4 text-[var(--accent-primary)]" />
                  {t("childDev.attachments.title")} ({childAttachments.length})
                </CardTitle>
                <CardDescription>{t("childDev.attachments.subtitle")}</CardDescription>
              </div>
              {(data.canManageGrowthMilestones || data.canViewHealth) && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAttOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t("childDev.attachments.upload")}
                </Button>
              )}
            </CardHeader>

            {childAttachments.length === 0 ? (
              <p className="text-[13.5px] text-[var(--text-secondary)]">
                {t("childDev.attachments.empty")}
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {childAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-medium">
                          {att.fileName}
                        </p>
                        <Badge variant="neutral">
                          {t(`childDev.attachments.type.${att.recordType}`)}
                        </Badge>
                      </div>
                      {att.notes && (
                        <p className="text-[12.5px] text-[var(--text-secondary)]">
                          {att.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`${t("common.preview")} ${att.fileName}`}
                        onClick={() => void handleOpenAttachment(att.id, false)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("common.preview")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`${t("common.download")} ${att.fileName}`}
                        onClick={() => void handleOpenAttachment(att.id, true)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t("common.download")}
                      </Button>
                      {((att.recordType === "health" && data.canViewHealth) ||
                        (att.recordType !== "health" && data.canManageGrowthMilestones)) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`${t("common.delete")} ${att.fileName}`}
                          onClick={() => setDeleteAttTarget(att)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Sheets */}
      <BottomSheet open={profileOpen} onClose={() => setProfileOpen(false)} title={t("childDev.sheet.profileTitle")}>
        <form onSubmit={handleCreateProfile} className="space-y-4">
          <Input label={t("childDev.sheet.childName")} required value={pName} onChange={(e) => setPName(e.target.value)} />
          <Input label={t("childDev.sheet.birthDate")} type="date" required value={pBirth} onChange={(e) => setPBirth(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("childDev.sheet.schoolOpt")} value={pSchool} onChange={(e) => setPSchool(e.target.value)} />
            <Input label={t("childDev.sheet.gradeOpt")} value={pGrade} onChange={(e) => setPGrade(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("childDev.sheet.saveProfile")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={milestoneOpen} onClose={() => setMilestoneOpen(false)} title={t("childDev.sheet.milestoneTitle")}>
        <form onSubmit={handleAddMilestone} className="space-y-4">
          <Input label={t("childDev.milestoneTitleLabel")} required placeholder={t("childDev.milestoneTitlePlaceholder")} value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t("childDev.sheet.categoryLabel")} value={mCat} onChange={(e) => setMCat(e.target.value as typeof mCat)} options={[{ value: "physical", label: t("childDev.cat.physical") }, { value: "cognitive", label: t("childDev.cat.cognitive") }, { value: "social", label: t("childDev.cat.social") }, { value: "academic", label: t("childDev.cat.academic") }, { value: "activity", label: t("childDev.cat.activity") }]} />
            <Input label={t("childDev.sheet.dateAchieved")} type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
          </div>
          <Input label={t("childDev.sheet.storyNotes")} value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
          <Input label={t("childDev.photoFilenameLabel")} placeholder={t("childDev.photoFilenamePlaceholder")} value={mPhoto} onChange={(e) => setMPhoto(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("childDev.sheet.saveMilestone")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={growthOpen} onClose={() => setGrowthOpen(false)} title={t("childDev.sheet.growthTitle")}>
        <form onSubmit={handleAddGrowth} className="space-y-4">
          <Input label={t("childDev.sheet.measuredOn")} type="date" required value={gDate} onChange={(e) => setGDate(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("childDev.sheet.heightCm")} type="number" step="0.1" required value={gHeight} onChange={(e) => setGHeight(e.target.value)} />
            <Input label={t("childDev.sheet.weightKg")} type="number" step="0.1" required value={gWeight} onChange={(e) => setGWeight(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("childDev.sheet.saveMeasurement")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={eduOpen} onClose={() => setEduOpen(false)} title={t("childDev.sheet.eduTitle")}>
        <form onSubmit={handleAddEdu} className="space-y-4">
          <Select label={t("childDev.sheet.typeLabel")} value={eType} onChange={(e) => setEType(e.target.value as typeof eType)} options={[{ value: "academic_activity", label: t("childDev.eduType.academic_activity") }, { value: "important_date", label: t("childDev.eduType.important_date") }, { value: "school_info", label: t("childDev.eduType.school_info") }]} />
          <Input label={t("childDev.sheet.titleLabel")} required value={eTitle} onChange={(e) => setETitle(e.target.value)} />
          <Input label={t("childDev.sheet.dateOpt")} type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
          <Input label={t("childDev.sheet.detailsLabel")} value={eDetails} onChange={(e) => setEDetails(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("childDev.sheet.saveRecord")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={healthOpen} onClose={() => setHealthOpen(false)} title={t("childDev.sheet.healthTitle")}>
        <form onSubmit={handleAddHealth} className="space-y-4">
          <Select label={t("childDev.sheet.recordTypeLabel")} value={hType} onChange={(e) => setHType(e.target.value as typeof hType)} options={[{ value: "immunization", label: t("childDev.healthType.immunization") }, { value: "appointment", label: t("childDev.healthType.appointment") }, { value: "checkup", label: t("childDev.healthType.checkup") }, { value: "allergy_note", label: t("childDev.healthType.allergy_note") }]} />
          <Input label={t("childDev.sheet.titleLabel")} required value={hTitle} onChange={(e) => setHTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("childDev.sheet.providerLabel")} value={hProvider} onChange={(e) => setHProvider(e.target.value)} />
            <Input label={t("childDev.sheet.dateLabel")} type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} />
          </div>
          <Input label={t("childDev.sheet.notesLabel")} value={hNotes} onChange={(e) => setHNotes(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("childDev.sheet.saveHealthLog")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={attOpen}
        onClose={() => setAttOpen(false)}
        title={t("childDev.attachments.upload")}
      >
        <form onSubmit={handleUploadAttachment} className="space-y-4">
          <Select
            label={t("childDev.attachments.recordType")}
            value={attRecordType}
            onChange={(e) => setAttRecordType(e.target.value as typeof attRecordType)}
            options={[
              ...(data.canManageGrowthMilestones
                ? [
                    { value: "education", label: t("childDev.attachments.type.education") },
                    { value: "milestone", label: t("childDev.attachments.type.milestone") },
                  ]
                : []),
              ...(data.canViewHealth
                ? [{ value: "health", label: t("childDev.attachments.type.health") }]
                : []),
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="child-att-file" className="text-[13.5px] font-medium">
              {t("childDev.attachments.selectFile")}
            </label>
            <input
              id="child-att-file"
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setAttFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 text-[13.5px]"
            />
          </div>
          <Input
            label={t("childDev.attachments.notes")}
            value={attNotes}
            onChange={(e) => setAttNotes(e.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {busy ? t("childDev.attachments.uploading") : t("childDev.attachments.upload")}
          </Button>
        </form>
      </BottomSheet>

      <Dialog
        open={Boolean(deleteAttTarget)}
        onClose={() => !busy && setDeleteAttTarget(null)}
        title={t("childDev.attachments.deleteConfirmTitle")}
        description={t("childDev.attachments.deleteConfirmDesc")}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleteAttTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={busy}
              onClick={() => void handleDeleteAttachment()}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] font-medium">{deleteAttTarget?.fileName}</p>
      </Dialog>
    </Section>
  );
}
