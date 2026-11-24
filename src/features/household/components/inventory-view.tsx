"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  History,
  Minus,
  Package,
  Pencil,
  Plus,
  Trash2,
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
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  adjustInventoryAction,
  createInventoryItemAction,
  deleteInventoryItemAction,
  updateInventoryItemAction,
} from "../actions";
import type { getInventoryPageData } from "../server";

export function InventoryView({
  familyId,
  data,
}: {
  familyId: string;
  data: Awaited<ReturnType<typeof getInventoryPageData>>;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"stock" | "movements">("stock");
  const [category, setCategory] = React.useState("all");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [itemCat, setItemCat] = React.useState<"pantry" | "fridge" | "freezer" | "cleaning" | "medicine" | "supplies">("pantry");
  const [qty, setQty] = React.useState("1");
  const [unit, setUnit] = React.useState("unit");
  const [minThreshold, setMinThreshold] = React.useState("0");
  const [expiresOn, setExpiresOn] = React.useState("");

  const lowStockItems = data.items.filter(
    (i) => i.minThreshold > 0 && i.quantity <= i.minThreshold
  );
  const visibleItems = data.items.filter(
    (i) => category === "all" || i.category === category
  );

  const assetUnitOptions = React.useMemo(() => {
    const base = [
      { value: "unit", label: "unit" },
      { value: "buah", label: "buah" },
      { value: "set", label: "set" },
      { value: "pasang", label: "pasang" },
      { value: "lembar", label: "lembar" },
      { value: "bidang", label: "bidang" },
      { value: "pcs", label: "pcs" },
    ];
    if (unit.trim() && !base.some((o) => o.value.toLowerCase() === unit.trim().toLowerCase())) {
      base.push({ value: unit.trim(), label: unit.trim() });
    }
    return base;
  }, [unit]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const parsedQty = Number(qty);
    const parsedMin = Number(minThreshold);
    const payload = {
      familyId,
      name,
      category: itemCat,
      quantity: Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0,
      unit,
      minThreshold: Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 0,
      expiresOn: expiresOn || null,
    };
    const res = editingItemId
      ? await updateInventoryItemAction({ ...payload, itemId: editingItemId })
      : await createInventoryItemAction(payload);
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setName("");
      setEditingItemId(null);
      setAddOpen(false);
      toast.success(t("inv.addedToast"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("inv.title")}
        description={t("inv.desc")}
        actions={
          data.canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingItemId(null);
                setName("");
                setItemCat("pantry");
                setQty("1");
                setUnit("unit");
                setMinThreshold("0");
                setExpiresOn("");
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("inv.addItemBtn")}
            </Button>
          ) : undefined
        }
      />

      {lowStockItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--tint-peach)] px-5 py-3.5 text-[13.5px] text-[var(--tint-peach-fg)]">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {t("inv.lowStockBanner", { count: lowStockItems.length })}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          activeId={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={[
            { id: "stock", label: t("inv.tab.stock"), badge: data.items.length },
            { id: "movements", label: t("inv.tab.movements"), badge: data.movements.length },
          ]}
        />

        {tab === "stock" && (
          <Select
            aria-label={t("inv.filterCategoryAria")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: "all", label: t("inv.allLocations") },
              { value: "pantry", label: t("inv.cat.pantry") },
              { value: "fridge", label: t("inv.cat.fridge") },
              { value: "freezer", label: t("inv.cat.freezer") },
              { value: "cleaning", label: t("inv.cat.cleaning") },
              { value: "medicine", label: t("inv.cat.medicine") },
              { value: "supplies", label: t("inv.cat.supplies") },
            ]}
          />
        )}
      </div>

      {tab === "stock" && (
        <div className="space-y-2.5">
          {visibleItems.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={t("inv.emptyTitle")}
              description={t("inv.emptyDesc")}
            />
          ) : (
            visibleItems.map((item) => {
              const isLow = item.minThreshold > 0 && item.quantity <= item.minThreshold;
              return (
                <Card
                  key={item.id}
                  className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-[15.5px] font-semibold">
                        {item.name}
                      </p>
                      <Badge variant="neutral">
                        {t(`inv.cat.${item.category}` as "inv.cat.pantry")}
                      </Badge>
                      {isLow && <Badge variant="peach">{t("inv.lowStockBadge")}</Badge>}
                      {item.expiresOn && (
                        <Badge variant="blush" className="tabular-nums">
                          {t("inv.expBadge", { date: formatLocalizedDate(item.expiresOn, locale) })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                      {t("inv.minThreshold", { min: item.quantity, unit: item.unit })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {data.canManage && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={t("inv.decreaseAria")}
                            onClick={async () => {
                              await adjustInventoryAction({
                                familyId,
                                itemId: item.id,
                                delta: -1,
                                reason: "consumed",
                              });
                              router.refresh();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[54px] text-center text-[13.5px] font-semibold tabular-nums">
                            {item.quantity} {item.unit}
                          </span>
                          <button
                            type="button"
                            aria-label={t("inv.increaseAria")}
                            onClick={async () => {
                              await adjustInventoryAction({
                                familyId,
                                itemId: item.id,
                                delta: 1,
                                reason: "restock",
                              });
                              router.refresh();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`${t("common.edit")} ${item.name}`}
                          onClick={() => {
                            setEditingItemId(item.id);
                            setName(item.name);
                            setItemCat(item.category as typeof itemCat);
                            setQty(String(item.quantity));
                            setUnit(item.unit);
                            setMinThreshold(String(item.minThreshold));
                            setExpiresOn(item.expiresOn ?? "");
                            setAddOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`${t("common.delete")} ${item.name}`}
                          onClick={async () => {
                            setBusy(true);
                            const r = await deleteInventoryItemAction({ familyId, id: item.id });
                            setBusy(false);
                            if (!r.ok) toast.error(te(r.error));
                            else router.refresh();
                          }}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                        </button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === "movements" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.movements.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">
              {t("inv.movementsEmpty")}
            </p>
          ) : (
            data.movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <History className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span className="font-medium">{m.itemName}</span>
                  <Badge variant="neutral">{m.reason}</Badge>
                </div>
                <span className="font-semibold tabular-nums">
                  {m.deltaQuantity > 0 ? `+${m.deltaQuantity}` : m.deltaQuantity}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      <BottomSheet open={addOpen} onClose={() => { setAddOpen(false); setEditingItemId(null); }} title={t("inv.modal.title")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label={t("inv.modal.itemName")} required placeholder={t("inv.modal.itemPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t("inv.modal.location")} value={itemCat} onChange={(e) => setItemCat(e.target.value as typeof itemCat)} options={[{ value: "pantry", label: t("inv.cat.pantry") }, { value: "fridge", label: t("inv.cat.fridge") }, { value: "freezer", label: t("inv.cat.freezer") }, { value: "cleaning", label: t("inv.cat.cleaning") }, { value: "medicine", label: t("inv.cat.medicine") }, { value: "supplies", label: t("inv.cat.supplies") }]} />
            <Select label={t("inv.modal.unit")} value={unit} onChange={(e) => setUnit(e.target.value)} options={assetUnitOptions} />
            <Input label={t("inv.modal.quantity")} type="number" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input label={t("inv.modal.lowStockAt")} type="number" step="1" value={minThreshold} onChange={(e) => setMinThreshold(e.target.value)} />
          </div>
          <Input label={t("inv.modal.expiresOn")} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("inv.modal.saveItem")}</Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
