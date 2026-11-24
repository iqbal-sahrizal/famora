import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

export interface ShoppingPageData {
  currencyCode: string;
  canManage: boolean;
  members: Array<{ id: string; displayName: string }>;
  financeAccounts: Array<{ id: string; name: string }>;
  lists: Array<{
    id: string;
    name: string;
    storeName: string;
    assignedShopperMemberId: string | null;
    assignedShopperName: string | null;
  }>;
  items: Array<{
    id: string;
    listId: string | null;
    name: string;
    category: string;
    quantity: string;
    unit: string;
    estimatedPriceCents: number;
    notes: string;
    isChecked: boolean;
    addedByName: string | null;
    assignedShopperName: string | null;
    checkedByName: string | null;
  }>;
  templates: Array<{
    id: string;
    name: string;
    items: Array<{ name: string; category: string; quantity: string; unit: string }>;
  }>;
  history: Array<{
    id: string;
    itemName: string;
    category: string;
    lastQuantity: string;
    lastUnit: string;
    purchaseCount: number;
  }>;
}

export async function getShoppingPageData(familyId: string): Promise<ShoppingPageData> {
  const fallback: ShoppingPageData = {
    currencyCode: "USD",
    canManage: false,
    members: [],
    financeAccounts: [],
    lists: [],
    items: [],
    templates: [],
    history: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const [
      { data: fam },
      { data: perms },
      { data: membersData },
      { data: listsData },
      { data: itemsData },
      { data: templatesData },
      { data: historyData },
      { data: financeAccountsData },
    ] = await Promise.all([
      supabase.from("families").select("currency_code").eq("id", familyId).maybeSingle(),
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, display_name")
        .eq("family_id", familyId)
        .eq("status", "active"),
      supabase
        .from("shopping_lists")
        .select("id, name, store_name, assigned_shopper_member_id")
        .eq("family_id", familyId)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("shopping_items")
        .select(
          "id, list_id, name, category, quantity, unit, estimated_price_cents, notes, is_checked, added_by_member_id, assigned_shopper_member_id, checked_by_member_id"
        )
        .eq("family_id", familyId)
        .order("is_checked", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("shopping_templates")
        .select("id, name, items_jsonb")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("shopping_item_history")
        .select("id, item_name, category, last_quantity, last_unit, purchase_count")
        .eq("family_id", familyId)
        .order("purchase_count", { ascending: false })
        .limit(12),
      supabase
        .from("finance_accounts")
        .select("id, name")
        .eq("family_id", familyId)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
    ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const members = ((membersData ?? []) as Array<{ id: string; display_name: string }>).map(
      (m) => ({ id: m.id, displayName: m.display_name })
    );
    const memberMap = new Map(members.map((m) => [m.id, m.displayName]));

    return {
      currencyCode: fam?.currency_code ?? "USD",
      canManage: permSet.has("shopping.manage"),
      members,
      financeAccounts: ((financeAccountsData ?? []) as Array<{ id: string; name: string }>).map(
        (a) => ({ id: a.id, name: a.name })
      ),
      lists: (listsData ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        storeName: l.store_name,
        assignedShopperMemberId: l.assigned_shopper_member_id ?? null,
        assignedShopperName: l.assigned_shopper_member_id
          ? memberMap.get(l.assigned_shopper_member_id) ?? null
          : null,
      })),
      items: (itemsData ?? []).map((i) => ({
        id: i.id,
        listId: i.list_id,
        name: i.name,
        category: i.category,
        quantity: i.quantity,
        unit: i.unit ?? "pcs",
        estimatedPriceCents: Number(i.estimated_price_cents ?? 0),
        notes: i.notes ?? "",
        isChecked: i.is_checked,
        addedByName: i.added_by_member_id
          ? memberMap.get(i.added_by_member_id) ?? null
          : null,
        assignedShopperName: i.assigned_shopper_member_id
          ? memberMap.get(i.assigned_shopper_member_id) ?? null
          : null,
        checkedByName: i.checked_by_member_id
          ? memberMap.get(i.checked_by_member_id) ?? null
          : null,
      })),
      templates: (templatesData ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        items: Array.isArray(t.items_jsonb)
          ? (t.items_jsonb as Array<{
              name: string;
              category: string;
              quantity: string;
              unit: string;
            }>)
          : [],
      })),
      history: (historyData ?? []).map((h) => ({
        id: h.id,
        itemName: h.item_name,
        category: h.category,
        lastQuantity: h.last_quantity,
        lastUnit: h.last_unit,
        purchaseCount: h.purchase_count,
      })),
    };
  } catch {
    return fallback;
  }
}
