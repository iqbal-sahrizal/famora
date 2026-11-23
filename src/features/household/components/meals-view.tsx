"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Clock,
  Plus,
  ShoppingBag,
  Users,
  UtensilsCrossed,
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
  createMealPlanAction,
  createRecipeAction,
  syncMealIngredientsToShoppingAction,
} from "../actions";
import type { getMealsPageData } from "../server";

export function MealsView({
  familyId,
  data,
}: {
  familyId: string;
  data: Awaited<ReturnType<typeof getMealsPageData>>;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"planner" | "recipes">("planner");
  const [planOpen, setPlanOpen] = React.useState(false);
  const [recipeOpen, setRecipeOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [plannedOn, setPlannedOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [mealSlot, setMealSlot] = React.useState<"breakfast" | "lunch" | "dinner">("dinner");
  const [recipeId, setRecipeId] = React.useState("");
  const [customTitle, setCustomTitle] = React.useState("");
  const [prefNote, setPrefNote] = React.useState("");

  const [rTitle, setRTitle] = React.useState("");
  const [rPrep, setRPrep] = React.useState("30");
  const [rServings, setRServings] = React.useState("4");
  const [rTags, setRTags] = React.useState("Kid-friendly, Quick");
  const [rIngredients, setRIngredients] = React.useState("Pasta\nCherry Tomatoes\nGarlic");

  const handleSyncWeekToShopping = async () => {
    const allIngredients = data.plans.flatMap((p) => p.ingredients);
    if (allIngredients.length === 0) {
      toast.info(t("meals.syncEmptyInfo"));
      return;
    }
    setBusy(true);
    const res = await syncMealIngredientsToShoppingAction({
      familyId,
      ingredients: allIngredients,
    });
    setBusy(false);
    if (res.ok) toast.success(t("meals.syncSuccessToast", { count: allIngredients.length }));
    else toast.error(te(res.error));
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createMealPlanAction({
      familyId,
      plannedOn,
      mealSlot,
      recipeId: recipeId || null,
      customTitle,
      preferencesNote: prefNote,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setCustomTitle("");
      setPlanOpen(false);
      toast.success(t("meals.plannedToast"));
      router.refresh();
    }
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ingredients = rIngredients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, quantity: "1", unit: "pcs" }));

    const res = await createRecipeAction({
      familyId,
      title: rTitle,
      prepMinutes: Number(rPrep) || 25,
      servings: Number(rServings) || 4,
      dietaryTags: rTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      ingredients,
      instructions: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setRTitle("");
      setRecipeOpen(false);
      toast.success(t("meals.recipeSavedToast"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("meals.title")}
        description={t("meals.desc")}
        actions={
          data.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" isLoading={busy} onClick={handleSyncWeekToShopping}>
                <ShoppingBag className="h-4 w-4" />
                {t("meals.sendToShopping")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRecipeOpen(true)}>
                <BookOpen className="h-4 w-4" />
                {t("meals.addRecipe")}
              </Button>
              <Button size="sm" onClick={() => setPlanOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("meals.planMeal")}
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "planner", label: t("meals.tab.planner"), badge: data.plans.length },
          { id: "recipes", label: t("meals.tab.recipes"), badge: data.recipes.length },
        ]}
      />

      {tab === "planner" && (
        <div className="grid gap-4 md:grid-cols-3">
          {data.plans.length === 0 ? (
            <div className="md:col-span-3">
              <EmptyState
                icon={<UtensilsCrossed className="h-5 w-5" />}
                title={t("meals.emptyTitle")}
                description={t("meals.emptyDesc")}
                actionLabel={data.canManage ? t("meals.planFirstBtn") : undefined}
                onAction={data.canManage ? () => setPlanOpen(true) : undefined}
              />
            </div>
          ) : (
            data.plans.map((p) => (
              <Card
                key={p.id}
                variant={p.mealSlot === "dinner" ? "peach" : p.mealSlot === "lunch" ? "sage" : "elevated"}
                className="space-y-2 p-5"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="neutral">{t(`meals.slot.${p.mealSlot}` as "meals.slot.dinner")}</Badge>
                  <span className="text-[12px] opacity-80 tabular-nums">{formatLocalizedDate(p.plannedOn, locale)}</span>
                </div>
                <CardTitle className="text-[18px]">{p.title || t("meals.defaultTitle")}</CardTitle>
                {p.preferencesNote && <CardDescription>{p.preferencesNote}</CardDescription>}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "recipes" && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.recipes.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title={t("meals.recipesEmptyTitle")}
                description={t("meals.recipesEmptyDesc")}
              />
            </div>
          ) : (
            data.recipes.map((r) => (
              <Card key={r.id} className="space-y-3 p-6">
                <div className="flex flex-wrap gap-1.5">
                  {r.dietaryTags.map((tag) => (
                    <Badge key={tag} variant="lavender">{tag}</Badge>
                  ))}
                </div>
                <CardTitle className="text-[19px]">{r.title}</CardTitle>
                <div className="flex items-center gap-4 text-[12.5px] text-[var(--text-secondary)] tabular-nums">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t("meals.prepMinutes", { min: r.prepMinutes })}</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t("meals.servings", { count: r.servings })}</span>
                </div>
                {r.ingredients.length > 0 && (
                  <p className="text-[12.5px] text-[var(--text-muted)]">
                    {t("meals.ingredientsPrefix", { list: r.ingredients.map((i) => i.name).join(", ") })}
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      <BottomSheet open={planOpen} onClose={() => setPlanOpen(false)} title={t("meals.modal.planTitle")}>
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("meals.modal.date")} type="date" required value={plannedOn} onChange={(e) => setPlannedOn(e.target.value)} />
            <Select label={t("meals.modal.mealSlot")} value={mealSlot} onChange={(e) => setMealSlot(e.target.value as typeof mealSlot)} options={[{ value: "breakfast", label: t("meals.slot.breakfast") }, { value: "lunch", label: t("meals.slot.lunch") }, { value: "dinner", label: t("meals.slot.dinner") }]} />
          </div>
          {data.recipes.length > 0 && (
            <Select label={t("meals.modal.pickRecipe")} value={recipeId} onChange={(e) => setRecipeId(e.target.value)} options={[{ value: "", label: t("meals.modal.customMeal") }, ...data.recipes.map((r) => ({ value: r.id, label: r.title }))]} />
          )}
          {!recipeId && (
            <Input label={t("meals.modal.mealTitle")} placeholder={t("meals.modal.mealPlaceholder")} value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
          )}
          <Input label={t("meals.modal.prefNote")} placeholder={t("meals.modal.prefPlaceholder")} value={prefNote} onChange={(e) => setPrefNote(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("meals.modal.savePlan")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={recipeOpen} onClose={() => setRecipeOpen(false)} title={t("meals.modal.recipeTitle")}>
        <form onSubmit={handleCreateRecipe} className="space-y-4">
          <Input label={t("meals.modal.recipeName")} required placeholder={t("meals.modal.recipePlaceholder")} value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("meals.modal.prepTime")} type="number" value={rPrep} onChange={(e) => setRPrep(e.target.value)} />
            <Input label={t("meals.modal.servingsLabel")} type="number" value={rServings} onChange={(e) => setRServings(e.target.value)} />
          </div>
          <Input label={t("meals.modal.tags")} value={rTags} onChange={(e) => setRTags(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="recipe-ings" className="text-[13.5px] font-medium">{t("meals.modal.ingredients")}</label>
            <textarea id="recipe-ings" rows={3} value={rIngredients} onChange={(e) => setRIngredients(e.target.value)} className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[13.5px]" />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("meals.modal.saveRecipe")}</Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
