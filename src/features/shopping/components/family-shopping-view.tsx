"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  History,
  Layers,
  Minus,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { OfflineCacheBanner } from "@/components/pwa/offline-cache-banner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useOfflineCachedData } from "@/hooks/use-offline-cached-data";
import { toIntlLocale } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  cn,
  formatCurrency,
  getCurrencyPrefix,
  sanitizeNumericCurrencyInput,
} from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  addShoppingItemAction,
  applyShoppingTemplateAction,
  createShoppingListAction,
  deleteShoppingItemAction,
  deleteShoppingListAction,
  toggleShoppingCheckAction,
  updateShoppingItemAction,
  updateShoppingListAction,
  updateShoppingQuantityAction,
} from "../actions";
import {
  createQueuedShoppingMutation,
  enqueueShoppingMutation,
} from "../offline-queue";
import type { ShoppingPageData } from "../server";

export function FamilyShoppingView({
  familyId,
  data,
}: {
  familyId: string;
  data: ShoppingPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const isShoppingEmpty = React.useCallback(
    (d: ShoppingPageData) => d.lists.length === 0 && d.items.length === 0,
    []
  );
  const {
    effectiveData,
    isFromCache,
    isCacheExpired,
    cachedAt,
    isOnline,
  } = useOfflineCachedData({
    familyId,
    domain: "shopping",
    serverData: data,
    isEmptyData: isShoppingEmpty,
  });
  const [selectedListId, setSelectedListId] = React.useState<string | null>(
    effectiveData.lists[0]?.id ?? null
  );
  const [quickName, setQuickName] = React.useState("");
  const [quickCategory, setQuickCategory] = React.useState("Groceries");
  const [quickQty, setQuickQty] = React.useState("1");
  const [quickPrice, setQuickPrice] = React.useState("");
  const [quickShopper, setQuickShopper] = React.useState("");
  const financeAccounts = React.useMemo(
    () => effectiveData.financeAccounts ?? [],
    [effectiveData.financeAccounts]
  );
  const [selectedFinanceAccountId, setSelectedFinanceAccountId] = React.useState(
    () => financeAccounts[0]?.id ?? ""
  );
  React.useEffect(() => {
    if (
      financeAccounts.length > 0 &&
      !financeAccounts.some((a) => a.id === selectedFinanceAccountId)
    ) {
      setSelectedFinanceAccountId(financeAccounts[0].id);
    }
  }, [financeAccounts, selectedFinanceAccountId]);
  const currencyPrefix = getCurrencyPrefix(effectiveData.currencyCode);
  const [busy, setBusy] = React.useState(false);

  const [newListOpen, setNewListOpen] = React.useState(false);
  const [listName, setListName] = React.useState("");
  const [storeName, setStoreName] = React.useState("");

  const [editListOpen, setEditListOpen] = React.useState(false);
  const [editListId, setEditListId] = React.useState<string | null>(null);
  const [editListName, setEditListName] = React.useState("");
  const [editStoreName, setEditStoreName] = React.useState("");
  const [editShopperId, setEditShopperId] = React.useState("");
  const [deleteListTarget, setDeleteListTarget] = React.useState<{
    id: string;
    name: string;
    itemCount: number;
  } | null>(null);

  const [itemsState, setItemsState] = React.useState(effectiveData.items);
  React.useEffect(() => {
    setItemsState(effectiveData.items);
  }, [effectiveData.items]);

  type ShoppingItem = ShoppingPageData["items"][number];
  const [editingItem, setEditingItem] = React.useState<ShoppingItem | null>(null);
  const [editItemName, setEditItemName] = React.useState("");
  const [editItemQty, setEditItemQty] = React.useState("1");
  const [editItemUnit, setEditItemUnit] = React.useState("pcs");
  const [editItemCategory, setEditItemCategory] = React.useState("Groceries");
  const [editItemPrice, setEditItemPrice] = React.useState("");
  const [editItemNotes, setEditItemNotes] = React.useState("");

  const selectedList = React.useMemo(
    () => effectiveData.lists.find((l) => l.id === selectedListId) ?? null,
    [effectiveData.lists, selectedListId]
  );

  React.useEffect(() => {
    if (selectedListId && !effectiveData.lists.some((l) => l.id === selectedListId)) {
      setSelectedListId(effectiveData.lists[0]?.id ?? null);
    } else if (!selectedListId && effectiveData.lists.length > 0) {
      setSelectedListId(effectiveData.lists[0]?.id ?? null);
    }
  }, [effectiveData.lists, selectedListId]);

  // Supabase Realtime subscription for collaborative live updates
  React.useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`family:${familyId}:shopping`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "shopping_items",
            filter: `family_id=eq.${familyId}`,
          },
          () => {
            router.refresh();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // Supabase client unconfigured in static/offline preview
    }
  }, [familyId, router]);

  const visibleItems = React.useMemo(() => {
    if (!selectedListId) return itemsState;
    return itemsState.filter((i) => i.listId === selectedListId);
  }, [itemsState, selectedListId]);

  const checkedCount = visibleItems.filter((i) => i.isChecked).length;
  const totalCount = visibleItems.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const remainingCents = visibleItems
    .filter((i) => !i.isChecked)
    .reduce((sum, i) => sum + i.estimatedPriceCents, 0);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;
    const quickPriceFloat = Number.parseFloat(quickPrice);
    const quickPriceCents =
      Number.isFinite(quickPriceFloat) && quickPriceFloat > 0
        ? Math.round(quickPriceFloat * 100)
        : 0;

    if (!isOnline) {
      const mutation = createQueuedShoppingMutation(familyId, "add_item", {
        listId: selectedListId,
        name: quickName.trim(),
        category: quickCategory,
        quantity: quickQty || "1",
        unit: "pcs",
        estimatedPriceCents: quickPriceCents,
        notes: "",
        assignedShopperMemberId: quickShopper || null,
      });
      await enqueueShoppingMutation(mutation);
      const shopperName =
        effectiveData.members.find((m) => m.id === quickShopper)?.displayName ??
        null;
      setItemsState((prev) => [
        {
          id: mutation.id,
          listId: selectedListId,
          name: quickName.trim(),
          category: quickCategory,
          quantity: quickQty || "1",
          unit: "pcs",
          estimatedPriceCents: quickPriceCents,
          notes: "",
          isChecked: false,
          assignedShopperName: shopperName,
          addedByName: null,
          checkedByName: null,
        },
        ...prev,
      ]);
      setQuickName("");
      setQuickPrice("");
      toast.info(t("shopping.toast.offlineAdd"));
      return;
    }

    setBusy(true);
    const res = await addShoppingItemAction({
      familyId,
      listId: selectedListId,
      name: quickName.trim(),
      category: quickCategory,
      quantity: quickQty || "1",
      unit: "pcs",
      estimatedPriceCents: quickPriceCents,
      notes: "",
      assignedShopperMemberId: quickShopper || null,
      clientMutationId: crypto.randomUUID(),
    });
    setBusy(false);

    if (!res.ok) toast.error(te(res.error));
    else {
      setQuickName("");
      setQuickPrice("");
      router.refresh();
    }
  };

  const handleToggleCheck = async (itemId: string, current: boolean) => {
    if (!isOnline) {
      setItemsState((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, isChecked: !current } : it))
      );
      await enqueueShoppingMutation(
        createQueuedShoppingMutation(familyId, "toggle_check", {
          itemId,
          isChecked: !current,
        })
      );
      toast.info(t("shopping.toast.offlineToggle"));
      return;
    }

    const previous = itemsState;
    setItemsState((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, isChecked: !current } : it))
    );
    const res = await toggleShoppingCheckAction({
      familyId,
      itemId,
      isChecked: !current,
      financeAccountId: selectedFinanceAccountId || null,
    });
    if (!res.ok) {
      setItemsState(previous);
      toast.error(te(res.error));
    } else {
      router.refresh();
    }
  };

  const handleStepQuantity = async (
    itemId: string,
    currentQty: string,
    delta: -1 | 1
  ) => {
    const match = currentQty.trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
    const parsedNum = match ? Number(match[1]) : parseInt(currentQty, 10);
    const suffix = match ? match[2] : "";
    const nextNum = Math.max(1, (Number.isNaN(parsedNum) ? 1 : parsedNum) + delta);
    const nextQty = `${nextNum}${suffix}`;

    const previous = itemsState;
    setItemsState((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, quantity: nextQty } : it))
    );

    if (!isOnline) {
      await enqueueShoppingMutation(
        createQueuedShoppingMutation(familyId, "update_quantity", {
          itemId,
          quantity: nextQty,
        })
      );
      toast.info(t("shopping.toast.offlineToggle"));
      return;
    }

    const res = await updateShoppingQuantityAction({
      familyId,
      itemId,
      quantity: nextQty,
    });
    if (!res.ok) {
      setItemsState(previous);
      toast.error(te(res.error));
    } else {
      router.refresh();
    }
  };

  const openEditItem = (item: ShoppingItem) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemQty(item.quantity);
    setEditItemUnit(item.unit || "pcs");
    setEditItemCategory(item.category || "Groceries");
    setEditItemPrice(
      item.estimatedPriceCents > 0 ? (item.estimatedPriceCents / 100).toFixed(2) : ""
    );
    setEditItemNotes(item.notes ?? "");
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editItemName.trim()) return;
    const priceFloat = Number.parseFloat(editItemPrice);
    const priceCents = Number.isFinite(priceFloat) && priceFloat > 0 ? Math.round(priceFloat * 100) : 0;

    setBusy(true);
    const res = await updateShoppingItemAction({
      familyId,
      itemId: editingItem.id,
      name: editItemName.trim(),
      category: editItemCategory.trim() || "Groceries",
      quantity: editItemQty.trim() || "1",
      unit: editItemUnit.trim() || "pcs",
      estimatedPriceCents: priceCents,
      notes: editItemNotes.trim(),
    });
    setBusy(false);

    if (!res.ok) toast.error(te(res.error));
    else {
      setEditingItem(null);
      router.refresh();
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    setBusy(true);
    const res = await deleteShoppingItemAction({
      familyId,
      itemId: editingItem.id,
    });
    setBusy(false);

    if (!res.ok) toast.error(te(res.error));
    else {
      setEditingItem(null);
      router.refresh();
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createShoppingListAction({
      familyId,
      name: listName,
      storeName,
      assignedShopperMemberId: null,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setListName("");
      setStoreName("");
      setNewListOpen(false);
      toast.success(t("shopping.toast.listCreated"));
      router.refresh();
    }
  };

  const openEditList = (list: ShoppingPageData["lists"][number]) => {
    setEditListId(list.id);
    setEditListName(list.name);
    setEditStoreName(list.storeName);
    setEditShopperId(list.assignedShopperMemberId ?? "");
    setEditListOpen(true);
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editListId) return;
    setBusy(true);
    const res = await updateShoppingListAction({
      familyId,
      listId: editListId,
      name: editListName,
      storeName: editStoreName,
      assignedShopperMemberId: editShopperId || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setEditListOpen(false);
    setEditListId(null);
    toast.success(t("shopping.toast.listUpdated"));
    router.refresh();
  };

  const handleDeleteList = async () => {
    if (!deleteListTarget) return;
    setBusy(true);
    const res = await deleteShoppingListAction({
      familyId,
      listId: deleteListTarget.id,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    if (selectedListId === deleteListTarget.id) {
      setSelectedListId(null);
    }
    setDeleteListTarget(null);
    toast.success(t("shopping.toast.listDeleted"));
    router.refresh();
  };

  const shoppingCategoryOptions = React.useMemo(() => {
    const base = [
      { value: "Groceries", label: t("shopping.cat.groceries") },
      { value: "Produce", label: t("shopping.cat.produce") },
      { value: "Dairy", label: t("shopping.cat.dairy") },
      { value: "Household", label: t("shopping.cat.household") },
      { value: "Pharmacy", label: t("shopping.cat.pharmacy") },
    ];
    if (
      editItemCategory.trim() &&
      !base.some((o) => o.value.toLowerCase() === editItemCategory.trim().toLowerCase())
    ) {
      base.push({ value: editItemCategory.trim(), label: editItemCategory.trim() });
    }
    return base;
  }, [editItemCategory, t]);

  const formatShoppingCat = (cat: string) => {
    const found = shoppingCategoryOptions.find(
      (o) => o.value.toLowerCase() === cat.trim().toLowerCase()
    );
    return found ? found.label : cat;
  };

  const selectedFinanceAccountName =
    financeAccounts.find((a) => a.id === selectedFinanceAccountId)?.name ?? "";

  return (
    <Section>
      <OfflineCacheBanner
        isFromCache={isFromCache}
        isCacheExpired={isCacheExpired}
        cachedAt={cachedAt}
      />
      <PageHeader
        title={t("shopping.title")}
        description={t("shopping.subtitle")}
        badge={
          <Badge variant={isOnline ? "sage" : "peach"}>
            {isOnline ? (
              <>
                <Wifi className="h-3 w-3" /> {t("shopping.liveSync")}
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" /> {t("shopping.offlineQueue")}
              </>
            )}
          </Badge>
        }
        actions={
          data.canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setNewListOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("shopping.newList")}
            </Button>
          ) : undefined
        }
      />

      {/* Multiple Lists Switcher + Estimated Total */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedListId(null)}
            className={cn(
              "inline-flex min-h-11 sm:min-h-0 items-center rounded-full px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer",
              selectedListId === null
                ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            )}
          >
            {t("shopping.allItems", { count: itemsState.length })}
          </button>
          {data.lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelectedListId(l.id)}
              className={cn(
                "inline-flex min-h-11 sm:min-h-0 items-center rounded-full px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer",
                selectedListId === l.id
                  ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
              )}
            >
              {l.name}
              {l.assignedShopperName ? ` · ${l.assignedShopperName}` : ""}
            </button>
          ))}
        </div>

        {remainingCents > 0 && (
          <Badge variant="neutral" className="tabular-nums">
            {t("shopping.estRemaining", {
              amount: formatCurrency(
                remainingCents,
                data.currencyCode,
                toIntlLocale(locale)
              ),
            })}
          </Badge>
        )}

        {data.canManage && selectedList && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`${t("common.edit")} ${selectedList.name}`}
              onClick={() => openEditList(selectedList)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("shopping.editList")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`${t("common.delete")} ${selectedList.name}`}
              onClick={() =>
                setDeleteListTarget({
                  id: selectedList.id,
                  name: selectedList.name,
                  itemCount: data.items.filter((i) => i.listId === selectedList.id).length,
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
              {t("shopping.deleteList")}
            </Button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12.5px] font-medium text-[var(--text-secondary)] tabular-nums">
            <span>{t("shopping.progressLabel", { done: checkedCount, total: totalCount })}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Shopping Item Form */}
      {data.canManage && (
        <Card className="p-4 sm:p-5">
          <form onSubmit={handleQuickAdd} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-[15px] font-semibold">
                {t("shopping.addItemTitle")}
              </h2>
              {selectedFinanceAccountName ? (
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {t("shopping.financeAccountHint", { account: selectedFinanceAccountName })}
                </p>
              ) : (
                <p className="text-[12px] text-[var(--text-muted)]">
                  {t("shopping.noFinanceAccountHint")}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t("shopping.itemNameLabel")}
                required
                placeholder={t("shopping.quickAddPlaceholder")}
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
              />
              <Select
                label={t("shopping.categoryLabel")}
                aria-label={t("shopping.categoryAria")}
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                options={shoppingCategoryOptions}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label={t("shopping.qtyAria")}
                aria-label={t("shopping.qtyAria")}
                placeholder={t("shopping.qtyPlaceholder")}
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
              />
              <Input
                label={t("shopping.priceOptionalLabel")}
                aria-label={t("shopping.priceOptionalLabel")}
                type="text"
                inputMode="decimal"
                placeholder="0"
                leadingIcon={
                  <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">
                    {currencyPrefix}
                  </span>
                }
                value={quickPrice}
                onChange={(e) => setQuickPrice(sanitizeNumericCurrencyInput(e.target.value))}
                className="tabular-nums"
              />
              <Select
                label={t("shopping.assigneeAria")}
                aria-label={t("shopping.assigneeAria")}
                value={quickShopper}
                onChange={(e) => setQuickShopper(e.target.value)}
                options={[
                  { value: "", label: t("shopping.anyShopper") },
                  ...data.members.map((m) => ({
                    value: m.id,
                    label: m.displayName,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              {financeAccounts.length > 0 && (
                <div className="sm:min-w-[260px] sm:flex-1">
                  <Select
                    label={t("shopping.financeAccountLabel")}
                    value={selectedFinanceAccountId}
                    onChange={(e) => setSelectedFinanceAccountId(e.target.value)}
                    options={financeAccounts.map((a) => ({
                      value: a.id,
                      label: a.name,
                    }))}
                  />
                </div>
              )}
              <Button type="submit" isLoading={busy} className="sm:shrink-0">
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Shopping Items */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-2.5">
          {visibleItems.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="h-5 w-5" />}
              title={t("shopping.emptyTitle")}
              description={t("shopping.emptyDesc")}
            />
          ) : (
            visibleItems.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  "flex items-center justify-between gap-3 p-3.5 transition-all",
                  item.isChecked && "opacity-60"
                )}
              >
                <button
                  type="button"
                  disabled={!data.canManage}
                  onClick={() => handleToggleCheck(item.id, item.isChecked)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 text-left cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      item.isChecked
                        ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                        : "border-[var(--border-strong)]"
                    )}
                  >
                    {item.isChecked && <Check className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate font-heading text-[15px] font-semibold",
                        item.isChecked && "line-through"
                      )}
                    >
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--text-secondary)]">
                      <Badge variant="neutral">{formatShoppingCat(item.category)}</Badge>
                      {item.estimatedPriceCents > 0 && (
                        <span className="tabular-nums font-medium">
                          {formatCurrency(item.estimatedPriceCents, data.currencyCode, toIntlLocale(locale))}
                        </span>
                      )}
                      {item.addedByName && <span>Added by {item.addedByName}</span>}
                      {item.assignedShopperName && (
                        <span className="inline-flex items-center gap-1 text-[var(--accent-primary)] font-medium">
                          <UserCheck className="h-3 w-3" />
                          {item.assignedShopperName}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Mobile-Friendly Quantity Stepper + Edit */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={t("shopping.decQtyAria")}
                    disabled={!data.canManage}
                    onClick={() =>
                      handleStepQuantity(item.id, item.quantity, -1)
                    }
                    className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[28px] text-center text-[13px] font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={t("shopping.incQtyAria")}
                    disabled={!data.canManage}
                    onClick={() =>
                      handleStepQuantity(item.id, item.quantity, 1)
                    }
                    className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {data.canManage && (
                    <button
                      type="button"
                      aria-label={`${t("common.edit")} ${item.name}`}
                      onClick={() => openEditItem(item)}
                      className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Templates & Recent History Sidebar */}
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--accent-primary)]" />
              <h3 className="font-heading text-[16px] font-semibold">
                List Templates
              </h3>
            </div>
            {data.templates.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Save recurring grocery runs as reusable templates.
              </p>
            ) : (
              <div className="space-y-2">
                {data.templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-3.5 py-2.5"
                  >
                    <span className="text-[13.5px] font-medium">{tpl.name}</span>
                    <Button
                      size="sm"
                      variant="tonal"
                      disabled={busy || !data.canManage}
                      onClick={async () => {
                        setBusy(true);
                        const r = await applyShoppingTemplateAction({
                          familyId,
                          listId: selectedListId,
                          templateId: tpl.id,
                        });
                        setBusy(false);
                        if (!r.ok) {
                          toast.error(te(r.error));
                        } else {
                          toast.success(t("shopping.toast.templateAdded", { name: tpl.name }));
                          router.refresh();
                        }
                      }}
                    >
                      {t("shopping.applyBtn")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent-primary)]" />
              <h3 className="font-heading text-[16px] font-semibold">
                {t("shopping.frequentlyBought")}
              </h3>
            </div>
            {data.history.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                {t("shopping.frequentlyBoughtEmpty")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={busy || !data.canManage}
                    onClick={async () => {
                      setBusy(true);
                      const r = await addShoppingItemAction({
                        familyId,
                        listId: selectedListId,
                        name: h.itemName,
                        category: h.category,
                        quantity: h.lastQuantity,
                        unit: h.lastUnit,
                        estimatedPriceCents: 0,
                        notes: "",
                        assignedShopperMemberId: null,
                        clientMutationId: crypto.randomUUID(),
                      });
                      setBusy(false);
                      if (!r.ok) {
                        toast.error(te(r.error));
                      } else {
                        toast.success(t("shopping.toast.historyAdded", { name: h.itemName }));
                        router.refresh();
                      }
                    }}
                    className="inline-flex min-h-11 sm:min-h-0 items-center rounded-full bg-[var(--bg-subtle)] px-3.5 py-2 text-[12.5px] font-medium hover:bg-[var(--tint-sage)] hover:text-[var(--tint-sage-fg)] transition-colors cursor-pointer"
                  >
                    + {h.itemName}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <BottomSheet
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        title={t("shopping.modal.createListTitle")}
      >
        <form onSubmit={handleCreateList} className="space-y-4">
          <Input
            label={t("shopping.modal.listNameLabel")}
            required
            placeholder={t("shopping.listPlaceholder")}
            value={listName}
            onChange={(e) => setListName(e.target.value)}
          />
          <Input
            label={t("shopping.modal.storeOptLabel")}
            placeholder={t("shopping.storePlaceholder")}
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("shopping.modal.createListTitle")}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={editListOpen}
        onClose={() => setEditListOpen(false)}
        title={t("shopping.editListTitle")}
      >
        <form onSubmit={handleUpdateList} className="space-y-4">
          <Input
            label={t("shopping.listNameLabel")}
            required
            value={editListName}
            onChange={(e) => setEditListName(e.target.value)}
          />
          <Input
            label={t("shopping.storeLabel")}
            placeholder={t("shopping.storePlaceholder")}
            value={editStoreName}
            onChange={(e) => setEditStoreName(e.target.value)}
          />
          <Select
            label={t("shopping.shopperLabel")}
            value={editShopperId}
            onChange={(e) => setEditShopperId(e.target.value)}
            options={[
              { value: "", label: t("common.anyone") },
              ...data.members.map((m) => ({
                value: m.id,
                label: m.displayName,
              })),
            ]}
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </BottomSheet>

      <Dialog
        open={Boolean(deleteListTarget)}
        onClose={() => !busy && setDeleteListTarget(null)}
        title={t("shopping.deleteListTitle")}
        description={
          deleteListTarget
            ? deleteListTarget.itemCount > 0
              ? t("shopping.deleteListDescWithItems", {
                  name: deleteListTarget.name,
                  count: deleteListTarget.itemCount,
                })
              : t("shopping.deleteListDescEmpty", {
                  name: deleteListTarget.name,
                })
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleteListTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={busy}
              onClick={handleDeleteList}
            >
              {t("shopping.deleteList")}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("common.cannotUndo")}
        </p>
      </Dialog>

      {/* Edit Shopping Item Sheet */}
      <BottomSheet
        open={Boolean(editingItem)}
        onClose={() => !busy && setEditingItem(null)}
        title={t("shopping.editItemTitle")}
      >
        <form onSubmit={handleUpdateItem} className="space-y-4">
          <Input
            label={t("shopping.quickAddPlaceholder")}
            required
            value={editItemName}
            onChange={(e) => setEditItemName(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t("shopping.qtyPlaceholder")}
              required
              value={editItemQty}
              onChange={(e) => setEditItemQty(e.target.value)}
            />
            <Input
              label={t("shopping.unitLabel")}
              value={editItemUnit}
              onChange={(e) => setEditItemUnit(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("shopping.categoryLabel")}
              value={editItemCategory}
              onChange={(e) => setEditItemCategory(e.target.value)}
              options={shoppingCategoryOptions}
            />
            <Input
              label={t("shopping.priceOptionalLabel")}
              type="text"
              inputMode="decimal"
              placeholder="0"
              leadingIcon={
                <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  {currencyPrefix}
                </span>
              }
              value={editItemPrice}
              onChange={(e) => setEditItemPrice(sanitizeNumericCurrencyInput(e.target.value))}
              className="tabular-nums"
            />
          </div>
          <Input
            label={t("tasks.notesLabel")}
            value={editItemNotes}
            onChange={(e) => setEditItemNotes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" className="flex-1" isLoading={busy}>
              {t("shopping.saveItemBtn")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={handleDeleteItem}
            >
              <Trash2 className="h-4 w-4" />
              {t("shopping.deleteItemBtn")}
            </Button>
          </div>
        </form>
      </BottomSheet>
    </Section>
  );
}
