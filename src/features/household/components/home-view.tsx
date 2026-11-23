"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Home,
  Lock,
  Phone,
  Plus,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  completeMaintenanceTaskAction,
  createHomeAssetAction,
  createMaintenanceTaskAction,
  createServiceProviderAction,
} from "../actions";
import type { getHomePageData } from "../server";

export function HomeManagementView({
  familyId,
  data,
}: {
  familyId: string;
  data: Awaited<ReturnType<typeof getHomePageData>>;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"maintenance" | "assets" | "providers" | "history">("maintenance");
  const [assetOpen, setAssetOpen] = React.useState(false);
  const [maintOpen, setMaintOpen] = React.useState(false);
  const [provOpen, setProvOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [aName, setAName] = React.useState("");
  const [aCat, setACat] = React.useState<"appliance" | "hvac" | "vehicle" | "plumbing" | "electronics" | "structure">("appliance");
  const [aModel, setAModel] = React.useState("");
  const [aWarranty, setAWarranty] = React.useState("");

  const [mTitle, setMTitle] = React.useState("");
  const [mInterval, setMInterval] = React.useState("90");
  const [mDue, setMDue] = React.useState(() => new Date().toISOString().slice(0, 10));

  const [prName, setPrName] = React.useState("");
  const [prSpec, setPrSpec] = React.useState("");
  const [prPhone, setPrPhone] = React.useState("");

  if (!data.authorized) {
    return (
      <Section>
        <PageHeader title={t("home.title")} description={t("home.restrictedDesc")} />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("home.restrictedTitle")}
          description={t("home.restrictedBody")}
        />
      </Section>
    );
  }

  return (
    <Section>
      <PageHeader
        title={t("home.title")}
        description={t("home.desc")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setProvOpen(true)}>
              <Phone className="h-4 w-4" />
              {t("home.addProviderBtn")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAssetOpen(true)}>
              <Home className="h-4 w-4" />
              {t("home.addAssetBtn")}
            </Button>
            <Button size="sm" onClick={() => setMaintOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("home.scheduleMaintBtn")}
            </Button>
          </div>
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "maintenance", label: t("home.tab.maintenance"), badge: data.tasks.length },
          { id: "assets", label: t("home.tab.assets"), badge: data.assets.length },
          { id: "providers", label: t("home.tab.providers"), badge: data.providers.length },
          { id: "history", label: t("home.tab.history"), badge: data.history.length },
        ]}
      />

      {tab === "maintenance" && (
        <div className="space-y-3">
          {data.tasks.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-5 w-5" />}
              title={t("home.maintEmptyTitle")}
              description={t("home.maintEmptyDesc")}
            />
          ) : (
            data.tasks.map((task) => (
              <Card key={task.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <CardTitle className="text-[16px]">{task.title}</CardTitle>
                  <CardDescription className="tabular-nums">
                    {t("home.nextDue", {
                      date: formatLocalizedDate(task.nextDueOn, locale),
                      days: task.intervalDays,
                    })}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="tonal"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await completeMaintenanceTaskAction({
                      familyId,
                      taskId: task.id,
                      intervalDays: task.intervalDays,
                    });
                    setBusy(false);
                    if (r.ok) {
                      toast.success(t("home.completedToast"));
                      router.refresh();
                    } else toast.error(te(r.error));
                  }}
                >
                  <Check className="h-4 w-4" />
                  {t("home.markDoneBtn")}
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "assets" && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.assets.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState icon={<Home className="h-5 w-5" />} title={t("home.assetsEmptyTitle")} description={t("home.assetsEmptyDesc")} />
            </div>
          ) : (
            data.assets.map((a) => (
              <Card key={a.id} className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <Badge variant="sage">{t(`home.cat.${a.category}` as "home.cat.appliance")}</Badge>
                  {a.warrantyExpiresOn && (
                    <Badge variant="lavender" className="tabular-nums">
                      <ShieldCheck className="h-3 w-3" /> {t("home.warrantyLabel", { date: formatLocalizedDate(a.warrantyExpiresOn, locale) })}
                    </Badge>
                  )}
                </div>
                <CardTitle>{a.name}</CardTitle>
                {a.brandModel && <CardDescription>{a.brandModel}</CardDescription>}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "providers" && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.providers.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState icon={<Phone className="h-5 w-5" />} title={t("home.providersEmptyTitle")} description={t("home.providersEmptyDesc")} />
            </div>
          ) : (
            data.providers.map((p) => (
              <Card key={p.id} className="space-y-1.5 p-5">
                <Badge variant="neutral">{p.specialty || t("home.contractorDefault")}</Badge>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.phone || p.email}</CardDescription>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.history.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">{t("home.historyEmpty")}</p>
          ) : (
            data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 text-[13.5px]">
                <span className="font-medium">{h.taskTitle}</span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">{formatLocalizedDate(h.completedOn, locale)}</span>
              </div>
            ))
          )}
        </Card>
      )}

      <BottomSheet open={assetOpen} onClose={() => setAssetOpen(false)} title={t("home.modal.assetTitle")}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await createHomeAssetAction({ familyId, name: aName, category: aCat, brandModel: aModel, purchasedOn: null, warrantyExpiresOn: aWarranty || null });
          setBusy(false);
          if (r.ok) { setAName(""); setAssetOpen(false); toast.success(t("home.assetAddedToast")); router.refresh(); }
          else toast.error(te(r.error));
        }} className="space-y-4">
          <Input label={t("home.modal.assetName")} required placeholder={t("home.modal.assetPlaceholder")} value={aName} onChange={(e) => setAName(e.target.value)} />
          <Select label={t("home.modal.category")} value={aCat} onChange={(e) => setACat(e.target.value as typeof aCat)} options={[{ value: "appliance", label: t("home.cat.appliance") }, { value: "hvac", label: t("home.cat.hvac") }, { value: "vehicle", label: t("home.cat.vehicle") }, { value: "plumbing", label: t("home.cat.plumbing") }, { value: "electronics", label: t("home.cat.electronics") }, { value: "structure", label: t("home.cat.structure") }]} />
          <Input label={t("home.modal.brandModel")} placeholder={t("home.modal.brandPlaceholder")} value={aModel} onChange={(e) => setAModel(e.target.value)} />
          <Input label={t("home.modal.warrantyExpires")} type="date" value={aWarranty} onChange={(e) => setAWarranty(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("home.modal.saveAsset")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={maintOpen} onClose={() => setMaintOpen(false)} title={t("home.modal.maintTitle")}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await createMaintenanceTaskAction({ familyId, assetId: null, providerId: null, title: mTitle, intervalDays: Number(mInterval) || 90, nextDueOn: mDue, syncToCalendar: true });
          setBusy(false);
          if (r.ok) { setMTitle(""); setMaintOpen(false); toast.success(t("home.maintScheduledToast")); router.refresh(); }
          else toast.error(te(r.error));
        }} className="space-y-4">
          <Input label={t("home.modal.maintTask")} required placeholder={t("home.modal.maintPlaceholder")} value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("home.modal.repeatDays")} type="number" value={mInterval} onChange={(e) => setMInterval(e.target.value)} />
            <Input label={t("home.modal.nextDueDate")} type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("home.modal.saveSyncCalendar")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={provOpen} onClose={() => setProvOpen(false)} title={t("home.modal.provTitle")}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await createServiceProviderAction({ familyId, name: prName, specialty: prSpec, phone: prPhone, email: "" });
          setBusy(false);
          if (r.ok) { setPrName(""); setProvOpen(false); toast.success(t("home.provSavedToast")); router.refresh(); }
          else toast.error(te(r.error));
        }} className="space-y-4">
          <Input label={t("home.modal.provName")} required placeholder={t("home.modal.provPlaceholder")} value={prName} onChange={(e) => setPrName(e.target.value)} />
          <Input label={t("home.modal.specialty")} placeholder={t("home.modal.specialtyPlaceholder")} value={prSpec} onChange={(e) => setPrSpec(e.target.value)} />
          <Input label={t("home.modal.phone")} placeholder="+62 812-3456-7890" value={prPhone} onChange={(e) => setPrPhone(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("home.modal.saveProvider")}</Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
