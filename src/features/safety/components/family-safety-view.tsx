"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  Lock,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
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
import { formatLocalizedTime } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  createSafetyContactAction,
  createSafetyProtocolAction,
  deleteSafetyContactAction,
  enableLocationShareAction,
  revokeLocationShareAction,
} from "../actions";
import type {
  SafetyContactType,
  SafetyPageData,
  SafetyProtocolCategory,
} from "../types";

export function FamilySafetyView({
  familyId,
  data,
}: {
  familyId: string;
  data: SafetyPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [contactOpen, setContactOpen] = React.useState(false);
  const [protocolOpen, setProtocolOpen] = React.useState(false);
  const [locationOpen, setLocationOpen] = React.useState(false);

  // Contact form
  const [contactType, setContactType] =
    React.useState<SafetyContactType>("emergency");
  const [contactName, setContactName] = React.useState("");
  const [contactRel, setContactRel] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactNotes, setContactNotes] = React.useState("");

  // Protocol form
  const [protoCat, setProtoCat] =
    React.useState<SafetyProtocolCategory>("procedure");
  const [protoTitle, setProtoTitle] = React.useState("");
  const [protoContent, setProtoContent] = React.useState("");

  // Consensual location share form
  const [consentChecked, setConsentChecked] = React.useState(false);
  const [areaText, setAreaText] = React.useState("");
  const [statusLabel, setStatusLabel] = React.useState("");
  const [durationMins, setDurationMins] = React.useState("60");
  const [busy, setBusy] = React.useState(false);
  const [selectedViewerIds, setSelectedViewerIds] = React.useState<string[]>(
    () =>
      data.members
        .filter((m) => m.id !== data.currentMemberId)
        .map((m) => m.id)
  );

  React.useEffect(() => {
    const validIds = new Set(
      data.members
        .filter((m) => m.id !== data.currentMemberId)
        .map((m) => m.id)
    );
    setSelectedViewerIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length > 0 ? filtered : Array.from(validIds);
    });
  }, [data.members, data.currentMemberId]);

  if (!data.canView) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t("safety.restrictedTitle")}
          description={t("safety.restrictedDesc")}
        />
      </Card>
    );
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await createSafetyContactAction({
      familyId,
      contactType,
      name: contactName,
      relationship: contactRel,
      phone: contactPhone,
      notes: contactNotes,
      isPrimary: contactType === "emergency",
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("safety.contactAddedToast"));
    setContactOpen(false);
    setContactName("");
    setContactPhone("");
    setContactRel("");
    setContactNotes("");
    router.refresh();
  };

  const handleAddProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await createSafetyProtocolAction({
      familyId,
      category: protoCat,
      title: protoTitle,
      content: protoContent,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("safety.protocolSavedToast"));
    setProtocolOpen(false);
    setProtoTitle("");
    setProtoContent("");
    router.refresh();
  };

  const handleEnableLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await enableLocationShareAction({
      familyId,
      consentAcknowledged: consentChecked,
      expiresInMinutes: Number(durationMins) || 60,
      sharedWithMemberIds: selectedViewerIds,
      statusLabel: statusLabel.trim() || t("safety.modal.defaultStatus"),
      approximateArea: areaText,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("safety.locationEnabledToast"));
    setLocationOpen(false);
    setConsentChecked(false);
    router.refresh();
  };

  const handleRevokeLocation = async () => {
    if (busy) return;
    setBusy(true);
    const res = await revokeLocationShareAction({ familyId });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("safety.locationRevokedToast"));
    router.refresh();
  };

  const emergencyContacts = data.contacts.filter(
    (c) => c.contactType === "emergency"
  );
  const trustedContacts = data.contacts.filter(
    (c) => c.contactType === "trusted"
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("safety.title")}
        description={t("safety.desc")}
        actions={
          data.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setProtocolOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t("safety.addProcedureBtn")}
              </Button>
              <Button type="button" onClick={() => setContactOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("safety.addContactBtn")}
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Consensual Location Check-In Hub */}
      <Section title={t("safety.locationSection")}>
        <Card className="p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--accent-primary)]" />
                <h3 className="font-heading text-[16px] font-bold">
                  {t("safety.locationHeading")}
                </h3>
                <Badge variant="sage">{t("safety.neverCovertBadge")}</Badge>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {t("safety.locationExplainer")}
              </p>
            </div>

            {data.myLocationShare?.isEnabled ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleRevokeLocation()}
              >
                {t("safety.stopSharingBtn")}
              </Button>
            ) : (
              <Button type="button" onClick={() => setLocationOpen(true)}>
                <ShieldCheck className="h-4 w-4" />
                {t("safety.shareCheckInBtn")}
              </Button>
            )}
          </div>

          {data.locationShares.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.locationShares.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 text-[13px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{s.memberName}</span>
                    <Badge variant="sage">{t("safety.activeBadge")}</Badge>
                  </div>
                  <p className="mt-1 text-[var(--text-primary)]">
                    {s.approximateArea}
                    {s.statusLabel ? ` · ${s.statusLabel}` : ""}
                  </p>
                  {s.expiresAt && (
                    <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                      {t("safety.autoExpires", { time: formatLocalizedTime(s.expiresAt, locale) })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      {/* Emergency & Trusted Contacts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t("safety.emergencyContactsSection")}>
          {emergencyContacts.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<Phone className="h-5 w-5" />}
                title={t("safety.emergencyEmptyTitle")}
                description={t("safety.emergencyEmptyDesc")}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {emergencyContacts.map((c) => (
                <Card
                  key={c.id}
                  className="flex items-start justify-between gap-3 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-[15px] font-bold">
                        {c.name}
                      </p>
                      {c.isPrimary && <Badge variant="peach">{t("safety.primaryBadge")}</Badge>}
                    </div>
                    <p className="text-[13px] font-medium text-[var(--accent-primary)]">
                      {c.phone}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {c.relationship}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </div>
                  {data.canManage && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t("safety.deleteContactAria")}
                      onClick={async () => {
                        setBusy(true);
                        const res = await deleteSafetyContactAction({
                          familyId,
                          contactId: c.id,
                        });
                        setBusy(false);
                        if (!res.ok) {
                          toast.error(te(res.error));
                          return;
                        }
                        router.refresh();
                      }}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section title={t("safety.trustedContactsSection")}>
          {trustedContacts.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<UserCheck className="h-5 w-5" />}
                title={t("safety.trustedEmptyTitle")}
                description={t("safety.trustedEmptyDesc")}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {trustedContacts.map((c) => (
                <Card
                  key={c.id}
                  className="flex items-start justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-heading text-[15px] font-bold">{c.name}</p>
                    <p className="text-[13px] font-medium text-[var(--accent-primary)]">
                      {c.phone}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {c.relationship}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </div>
                  {data.canManage && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t("safety.deleteContactAria")}
                      onClick={async () => {
                        setBusy(true);
                        const res = await deleteSafetyContactAction({
                          familyId,
                          contactId: c.id,
                        });
                        setBusy(false);
                        if (!res.ok) {
                          toast.error(te(res.error));
                          return;
                        }
                        router.refresh();
                      }}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Emergency Procedures & Safety Notes */}
      <Section title={t("safety.protocolsSection")}>
        {data.protocols.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={t("safety.protocolsEmptyTitle")}
              description={t("safety.protocolsEmptyDesc")}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.protocols.map((p) => (
              <Card key={p.id} className="space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-heading text-[16px] font-bold">
                    {p.title}
                  </h3>
                  <Badge variant="neutral">
                    {t(`safety.cat.${p.category}` as "safety.cat.procedure")}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                  {p.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Add Contact Sheet */}
      <BottomSheet
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title={t("safety.modal.contactTitle")}
      >
        <form onSubmit={handleAddContact} className="space-y-4">
          <Select
            value={contactType}
            onChange={(e) => setContactType(e.target.value as SafetyContactType)}
            options={[
              { value: "emergency", label: t("safety.contactType.emergency") },
              { value: "trusted", label: t("safety.contactType.trusted") },
            ]}
          />
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder={t("safety.modal.contactNamePlaceholder")}
            required
          />
          <Input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder={t("safety.modal.contactPhonePlaceholder")}
            required
          />
          <Input
            value={contactRel}
            onChange={(e) => setContactRel(e.target.value)}
            placeholder={t("safety.modal.contactRelPlaceholder")}
          />
          <Input
            value={contactNotes}
            onChange={(e) => setContactNotes(e.target.value)}
            placeholder={t("safety.modal.contactNotesPlaceholder")}
          />
          <Button type="submit" className="w-full">
            {t("safety.modal.saveContactBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Add Procedure Sheet */}
      <BottomSheet
        open={protocolOpen}
        onClose={() => setProtocolOpen(false)}
        title={t("safety.modal.protocolTitle")}
      >
        <form onSubmit={handleAddProtocol} className="space-y-4">
          <Select
            value={protoCat}
            onChange={(e) =>
              setProtoCat(e.target.value as SafetyProtocolCategory)
            }
            options={[
              { value: "procedure", label: t("safety.protoType.procedure") },
              { value: "emergency_info", label: t("safety.protoType.emergency_info") },
              { value: "safety_note", label: t("safety.protoType.safety_note") },
            ]}
          />
          <Input
            value={protoTitle}
            onChange={(e) => setProtoTitle(e.target.value)}
            placeholder={t("safety.modal.protoTitlePlaceholder")}
            required
          />
          <textarea
            rows={5}
            value={protoContent}
            onChange={(e) => setProtoContent(e.target.value)}
            placeholder={t("safety.modal.protoContentPlaceholder")}
            required
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
          <Button type="submit" className="w-full">
            {t("safety.modal.saveProtocolBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Consensual Location Share Sheet */}
      <BottomSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        title={t("safety.modal.locationTitle")}
      >
        <form onSubmit={handleEnableLocation} className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--tint-sand)]/60 p-3 text-[12.5px] text-[var(--text-secondary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
            <span>
              {t("safety.modal.locationNotice")}
            </span>
          </div>

          <Input
            value={areaText}
            onChange={(e) => setAreaText(e.target.value)}
            placeholder={t("safety.modal.areaPlaceholder")}
            required
          />
          <Input
            value={statusLabel}
            onChange={(e) => setStatusLabel(e.target.value)}
            placeholder={t("safety.modal.statusPlaceholder")}
          />
          <Select
            value={durationMins}
            onChange={(e) => setDurationMins(e.target.value)}
            options={[
              { value: "15", label: t("safety.dur.15") },
              { value: "60", label: t("safety.dur.60") },
              { value: "240", label: t("safety.dur.240") },
              { value: "480", label: t("safety.dur.480") },
            ]}
          />

          <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] p-3">
            <p className="text-[12px] font-semibold text-[var(--text-muted)]">
              {t("safety.modal.visibleTo")}
            </p>
            {data.members
              .filter((m) => m.id !== data.currentMemberId)
              .map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-[13.5px]">
                  <input
                    type="checkbox"
                    checked={selectedViewerIds.includes(m.id)}
                    onChange={(e) =>
                      setSelectedViewerIds((prev) =>
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

          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              required
            />
            <span>
              {t("safety.modal.consentLabel")}
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={!consentChecked}>
            {t("safety.modal.startCheckInBtn")}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
