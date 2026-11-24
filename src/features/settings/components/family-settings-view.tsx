"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Check,
  Lock,
  Palette,
  Shield,
  Sliders,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { AboutAndNotificationsCards } from "@/components/settings/about-senvamily-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { type Locale } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import { useUiStore } from "@/stores/ui-store";
import type { PermissionKey } from "@/types/domain";
import {
  deleteFamilyAction,
  updateFamilyPreferencesAction,
  updateFamilyPrivacyAction,
  updateMemberPermissionOverrideAction,
  updatePersonalPreferencesAction,
} from "../actions";
import type { FamilySettingsPayload } from "../server";

const CORE_MATRIX_PERMISSIONS: Array<{
  key: PermissionKey;
  labelKey: Parameters<ReturnType<typeof useLocale>["t"]>[0];
}> = [
  { key: "family.delete", labelKey: "settings.perm.familyDelete" },
  { key: "family.settings.manage", labelKey: "settings.perm.familySettings" },
  { key: "family.members.invite_manage", labelKey: "settings.perm.inviteManage" },
  { key: "finance.accounts.manage", labelKey: "settings.perm.financeManage" },
  { key: "finance.transactions.manage", labelKey: "settings.perm.transactionsManage" },
  { key: "documents.sensitive_vault", labelKey: "settings.perm.vaultPrivate" },
  { key: "memories.manage", labelKey: "settings.perm.memoriesManage" },
  { key: "safety.sos.trigger", labelKey: "settings.perm.safetySos" },
];

const DISPLAY_ROLES = [
  { key: "owner", labelKey: "settings.role.owner" },
  { key: "admin", labelKey: "settings.role.admin" },
  { key: "adult", labelKey: "settings.role.adult" },
  { key: "child", labelKey: "settings.role.child" },
  { key: "extended", labelKey: "settings.role.extended" },
] as const;

export function FamilySettingsView({
  familyId,
  currentUserId,
  data,
}: {
  familyId: string;
  currentUserId: string;
  data: FamilySettingsPayload;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { setLocale, t, te } = useLocale();
  const [activeTab, setActiveTab] = React.useState("rbac");
  const [busy, setBusy] = React.useState(false);

  const canManageSettings = data.myPermissions.includes("family.settings.manage");
  const canManageMembers = data.myPermissions.includes("family.members.invite_manage");
  const canDeleteFamily = data.myPermissions.includes("family.delete");

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = React.useState("");
  const [deletingFamily, setDeletingFamily] = React.useState(false);

  // Family Preferences
  const [name, setName] = React.useState(data.family?.name ?? "");
  const [description, setDescription] = React.useState(data.family?.description ?? "");
  const [timezone, setTimezone] = React.useState(data.family?.timezone ?? "UTC");
  const [currencyCode, setCurrencyCode] = React.useState(
    data.family?.currencyCode ?? "USD"
  );
  const [weekStartsOn, setWeekStartsOn] = React.useState<"sunday" | "monday">(
    data.family?.weekStartsOn ?? "monday"
  );

  // Privacy Settings
  const [allowMemberDirectory, setAllowMemberDirectory] = React.useState(
    data.family?.privacy.allowMemberDirectory ?? true
  );
  const [requireMfaForVault, setRequireMfaForVault] = React.useState(
    data.family?.privacy.requireMfaForVault ?? true
  );
  const [allowGuestMemories, setAllowGuestMemories] = React.useState(
    data.family?.privacy.allowGuestMemories ?? true
  );
  const [childKioskEnabled, setChildKioskEnabled] = React.useState(
    data.family?.privacy.childKioskEnabled ?? false
  );

  // Personal Preferences
  const [themeMode, setThemeMode] = React.useState<"light" | "dark" | "system">(
    data.personalPrefs.themeMode
  );
  const [selectedLocale, setSelectedLocale] = React.useState<Locale>(
    data.personalPrefs.locale
  );
  const [digestEnabled, setDigestEnabled] = React.useState(
    data.personalPrefs.digestEnabled
  );
  const [pushEnabled, setPushEnabled] = React.useState(
    data.personalPrefs.pushEnabled
  );
  const [emailEnabled, setEmailEnabled] = React.useState(
    data.personalPrefs.emailEnabled
  );
  const [inAppEnabled, setInAppEnabled] = React.useState(
    data.personalPrefs.inAppEnabled
  );

  // Member Override Selector
  const configurableMembers = data.members.filter(
    (m) => m.userId !== currentUserId && m.roleKey !== "owner"
  );
  const [selectedMemberId, setSelectedMemberId] = React.useState(
    configurableMembers[0]?.id ?? ""
  );

  const handleSaveFamilyPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await updateFamilyPreferencesAction({
      familyId,
      name,
      description,
      timezone,
      currencyCode,
      weekStartsOn,
      dateFormat: data.family?.dateFormat ?? "MMM d, yyyy",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("settings.toast.familySaved"));
      router.refresh();
    }
  };

  const handleSavePrivacy = async () => {
    setBusy(true);
    const res = await updateFamilyPrivacyAction({
      familyId,
      allowMemberDirectory,
      requireMfaForVault,
      allowGuestMemories,
      childKioskEnabled,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("settings.toast.privacySaved"));
      router.refresh();
    }
  };

  const savePersonalPrefs = async (nextLocale: Locale = selectedLocale) => {
    setBusy(true);
    setTheme(themeMode);
    const res = await updatePersonalPreferencesAction({
      familyId,
      themeMode,
      locale: nextLocale,
      digestEnabled,
      pushEnabled,
      emailEnabled,
      inAppEnabled,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setLocale(nextLocale);
      toast.success(t("settings.personal.saved"));
      router.refresh();
    }
  };

  const handleSavePersonal = async () => {
    await savePersonalPrefs(selectedLocale);
  };

  const handleOverrideChange = async (
    permissionKey: string,
    effect: "allow" | "deny" | "inherit"
  ) => {
    if (!selectedMemberId) return;
    setBusy(true);
    const res = await updateMemberPermissionOverrideAction({
      familyId,
      memberId: selectedMemberId,
      permissionKey,
      effect,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("settings.toast.overrideSaved"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        badge={
          <Badge variant="sage">
            {t("settings.activePermissionsBadge", { count: data.myPermissions.length })}
          </Badge>
        }
      />

      <Tabs
        activeId={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "rbac", label: t("settings.tab.rbac") },
          { id: "family", label: t("settings.tab.family") },
          { id: "personal", label: t("settings.tab.personal") },
        ]}
      />

      {/* Tab 1: RBAC Matrix & Per-Member Overrides */}
      {activeTab === "rbac" && (
        <div className="space-y-8">
          <Card className="space-y-4">
            <CardHeader className="mb-0">
              <div className="flex items-center gap-2.5">
                <Shield className="h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <CardTitle>{t("settings.matrix.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.matrix.desc")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.matrix.capability")}</TableHead>
                  {DISPLAY_ROLES.map((r) => (
                    <TableHead key={r.key} className="text-center">
                      {t(r.labelKey)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {CORE_MATRIX_PERMISSIONS.map((perm) => (
                  <TableRow key={perm.key}>
                    <TableCell>
                      <p className="font-medium">{t(perm.labelKey)}</p>
                      <p className="font-mono text-[11.5px] text-[var(--text-muted)]">
                        {perm.key}
                      </p>
                    </TableCell>
                    {DISPLAY_ROLES.map((role) => {
                      const roleRow = data.roleMatrix.find(
                        (rm) => rm.roleKey === role.key
                      );
                      const allowed =
                        roleRow?.permissions.includes(perm.key) ?? false;
                      return (
                        <TableCell key={role.key} className="text-center">
                          {allowed ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                              <X className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="space-y-5">
            <CardHeader className="mb-0">
              <div>
                <CardTitle>{t("settings.overrides.title")}</CardTitle>
                <CardDescription>
                  {t("settings.overrides.desc")}
                </CardDescription>
              </div>
            </CardHeader>

            {!canManageMembers ? (
              <p className="text-[13.5px] text-[var(--text-secondary)]">
                {t("settings.overrides.needPermission", { perm: "family.members.invite_manage" })}
              </p>
            ) : configurableMembers.length === 0 ? (
              <p className="text-[13.5px] text-[var(--text-secondary)]">
                {t("settings.overrides.inviteFirst")}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="max-w-xs">
                  <Select
                    label={t("settings.overrides.selectMember")}
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    options={configurableMembers.map((m) => ({
                      value: m.id,
                      label: `${m.displayName} (${m.roleKey})`,
                    }))}
                  />
                </div>

                <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)]">
                  {CORE_MATRIX_PERMISSIONS.filter(
                    (p) => p.key !== "family.delete"
                  ).map((perm) => {
                    const currentOverride = data.overrides.find(
                      (o) =>
                        o.memberId === selectedMemberId &&
                        o.permissionKey === perm.key
                    );
                    const effect = currentOverride?.effect ?? "inherit";
                    return (
                      <div
                        key={perm.key}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="text-[13.5px] font-medium">
                            {t(perm.labelKey)}
                          </p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)]">
                            {perm.key}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(["inherit", "allow", "deny"] as const).map((mode) => (
                            <Button
                              key={mode}
                              size="sm"
                              disabled={busy}
                              variant={effect === mode ? "primary" : "ghost"}
                              onClick={() =>
                                handleOverrideChange(perm.key, mode)
                              }
                            >
                              {t(`settings.overrides.mode.${mode}`)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 2: Family Preferences & Privacy */}
      {activeTab === "family" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <CardTitle>{t("settings.family.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.family.descSubtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <form onSubmit={handleSaveFamilyPrefs} className="space-y-4">
              <Input
                label={t("settings.family.nameLabel")}
                value={name}
                disabled={!canManageSettings}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label={t("settings.family.descLabel")}
                value={description}
                disabled={!canManageSettings}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label={t("settings.family.timezoneLabel")}
                  value={timezone}
                  disabled={!canManageSettings}
                  onChange={(e) => setTimezone(e.target.value)}
                  options={[
                    { value: "UTC", label: "UTC" },
                    { value: "America/Los_Angeles", label: "Pacific Time" },
                    { value: "America/New_York", label: "Eastern Time" },
                    { value: "Asia/Jakarta", label: "WIB (Jakarta)" },
                  ]}
                />
                <Select
                  label={t("settings.family.currencyLabel")}
                  value={currencyCode}
                  disabled={!canManageSettings}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  options={[
                    { value: "USD", label: "USD ($)" },
                    { value: "IDR", label: "IDR (Rp)" },
                    { value: "EUR", label: "EUR (€)" },
                    { value: "GBP", label: "GBP (£)" },
                  ]}
                />
              </div>
              <Select
                label={t("settings.family.weekStartsLabel")}
                value={weekStartsOn}
                disabled={!canManageSettings}
                onChange={(e) =>
                  setWeekStartsOn(e.target.value as "sunday" | "monday")
                }
                options={[
                  { value: "monday", label: t("settings.family.monday") },
                  { value: "sunday", label: t("settings.family.sunday") },
                ]}
              />
              {canManageSettings && (
                <Button type="submit" isLoading={busy}>
                  {t("settings.family.saveBtn")}
                </Button>
              )}
            </form>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <Lock className="h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <CardTitle>{t("settings.privacy.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.privacy.descSubtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="space-y-4">
              {[
                {
                  label: t("settings.privacy.aiOptOut"),
                  checked: requireMfaForVault,
                  set: setRequireMfaForVault,
                },
                {
                  label: t("settings.privacy.memberDir"),
                  checked: allowMemberDirectory,
                  set: setAllowMemberDirectory,
                },
                {
                  label: t("settings.privacy.childIsolation"),
                  checked: allowGuestMemories,
                  set: setAllowGuestMemories,
                },
                {
                  label: t("settings.privacy.auditLogging"),
                  checked: childKioskEnabled,
                  set: setChildKioskEnabled,
                },
              ].map((toggle) => (
                <label
                  key={toggle.label}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-4 py-3 cursor-pointer"
                >
                  <span className="text-[13.5px] font-medium">
                    {toggle.label}
                  </span>
                  <input
                    type="checkbox"
                    disabled={!canManageSettings}
                    checked={toggle.checked}
                    onChange={(e) => toggle.set(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                </label>
              ))}

              {canManageSettings && (
                <Button isLoading={busy} onClick={handleSavePrivacy}>
                  {t("settings.privacy.saveBtn")}
                </Button>
              )}
            </div>
          </Card>

          {canDeleteFamily && data.family && (
            <Card className="lg:col-span-2 border border-[var(--accent-danger)]/35 bg-[var(--bg-surface)]">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-[var(--accent-danger)]" />
                  <div>
                    <CardTitle className="text-[var(--accent-danger)]">
                      {t("settings.danger.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.danger.desc", { name: data.family.name })}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <div className="space-y-4">
                <p className="text-[13.5px] text-[var(--text-secondary)]">
                  {t("settings.danger.body")}
                </p>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setDeleteConfirmName("");
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("settings.danger.btn")}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab 3: Personal, Theme & Notification Placeholders */}
      {activeTab === "personal" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <Palette className="h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <CardTitle>{t("settings.personal.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.personal.descSubtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="space-y-4">
              <Select
                label={t("settings.personal.themeLabel")}
                value={themeMode}
                onChange={(e) =>
                  setThemeMode(e.target.value as "light" | "dark" | "system")
                }
                options={[
                  { value: "system", label: t("settings.personal.themeSystem") },
                  { value: "light", label: t("settings.personal.themeLight") },
                  { value: "dark", label: t("settings.personal.themeDark") },
                ]}
              />

              <Select
                label={t("settings.language.label")}
                value={selectedLocale}
                onChange={(e) => {
                  const next = (e.target.value === "en" ? "en" : "id") as Locale;
                  setSelectedLocale(next);
                  void savePersonalPrefs(next);
                }}
                options={[
                  { value: "id", label: t("settings.language.id") },
                  { value: "en", label: t("settings.language.en") },
                ]}
              />

              <label className="flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-4 py-3 cursor-pointer">
                <span className="text-[13.5px] font-medium">
                  {t("settings.personal.dailyDigest")}
                </span>
                <input
                  type="checkbox"
                  checked={digestEnabled}
                  onChange={(e) => setDigestEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#315C49]"
                />
              </label>

              <Button isLoading={busy} onClick={handleSavePersonal}>
                {t("settings.personal.saveButton")}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <Bell className="h-5 w-5 text-[var(--accent-primary)]" />
                <div>
                  <CardTitle>{t("settings.channels.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.channels.descSubtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="space-y-3">
              {[
                {
                  label: t("settings.channels.push"),
                  checked: pushEnabled,
                  set: setPushEnabled,
                },
                {
                  label: t("settings.channels.email"),
                  checked: emailEnabled,
                  set: setEmailEnabled,
                },
                {
                  label: t("settings.channels.whatsapp"),
                  checked: inAppEnabled,
                  set: setInAppEnabled,
                },
              ].map((ch) => (
                <label
                  key={ch.label}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-4 py-3 cursor-pointer"
                >
                  <span className="text-[13.5px] font-medium">{ch.label}</span>
                  <input
                    type="checkbox"
                    checked={ch.checked}
                    onChange={(e) => ch.set(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                </label>
              ))}
            </div>
          </Card>
        </div>
      )}

      <AboutAndNotificationsCards familyId={familyId} />

      {canDeleteFamily && data.family && (
        <BottomSheet
          open={deleteDialogOpen}
          onClose={() => !deletingFamily && setDeleteDialogOpen(false)}
          title={t("settings.delete.modalTitle")}
          description={t("settings.delete.confirmPrompt", { name: data.family.name })}
        >
          <div className="space-y-4">
            <Input
              label={t("settings.delete.confirmLabel")}
              placeholder={data.family.name}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
            />
            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={deletingFamily}
                onClick={() => setDeleteDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                isLoading={deletingFamily}
                disabled={deleteConfirmName !== data.family.name}
                onClick={async () => {
                  setDeletingFamily(true);
                  const res = await deleteFamilyAction({
                    familyId,
                    confirmationName: deleteConfirmName,
                  });
                  setDeletingFamily(false);
                  if (!res.ok) {
                    toast.error(te(res.error));
                    return;
                  }
                  useUiStore.getState().setActiveFamilyId(null);
                  setDeleteDialogOpen(false);
                  toast.success(t("settings.toast.familyDeleted"));
                  router.push(routes.onboarding);
                  router.refresh();
                }}
              >
                {t("settings.delete.confirmBtn")}
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </Section>
  );
}
