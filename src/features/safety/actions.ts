"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import {
  createSafetyContactSchema,
  createSafetyProtocolSchema,
  enableLocationShareSchema,
} from "./validation";

async function getSafetyActor(familyId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: perms }, { data: actor }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
  ]);
  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  return { supabase, actor, permSet };
}

export async function createSafetyContactAction(input: {
  familyId: string;
  contactType: "emergency" | "trusted";
  name: string;
  relationship?: string;
  phone: string;
  email?: string;
  notes?: string;
  isPrimary?: boolean;
}) {
  const parsed = createSafetyContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid contact details.",
    };
  }

  const { supabase, actor, permSet } = await getSafetyActor(parsed.data.familyId);
  if (!actor || !permSet.has("safety.contacts_medical.manage")) {
    return { ok: false, error: "Missing permission: safety.contacts_medical.manage" };
  }

  const { error } = await supabase.from("safety_contacts").insert({
    family_id: parsed.data.familyId,
    created_by_member_id: actor.id,
    contact_type: parsed.data.contactType,
    name: parsed.data.name,
    relationship: parsed.data.relationship,
    phone: parsed.data.phone,
    email: parsed.data.email,
    notes: parsed.data.notes,
    is_primary: parsed.data.isPrimary,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "safety"));
  return { ok: true };
}

export async function deleteSafetyContactAction(input: {
  familyId: string;
  contactId: string;
}) {
  const { supabase, actor, permSet } = await getSafetyActor(input.familyId);
  if (!actor || !permSet.has("safety.contacts_medical.manage")) {
    return { ok: false, error: "Missing permission: safety.contacts_medical.manage" };
  }

  const { error } = await supabase
    .from("safety_contacts")
    .delete()
    .eq("id", input.contactId)
    .eq("family_id", input.familyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(input.familyId, "safety"));
  return { ok: true };
}

export async function createSafetyProtocolAction(input: {
  familyId: string;
  category: "emergency_info" | "procedure" | "safety_note";
  title: string;
  content: string;
}) {
  const parsed = createSafetyProtocolSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid protocol details.",
    };
  }

  const { supabase, actor, permSet } = await getSafetyActor(parsed.data.familyId);
  if (!actor || !permSet.has("safety.contacts_medical.manage")) {
    return { ok: false, error: "Missing permission: safety.contacts_medical.manage" };
  }

  const { error } = await supabase.from("safety_protocols").insert({
    family_id: parsed.data.familyId,
    created_by_member_id: actor.id,
    category: parsed.data.category,
    title: parsed.data.title,
    content: parsed.data.content,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "safety"));
  return { ok: true };
}

export async function enableLocationShareAction(input: {
  familyId: string;
  consentAcknowledged: boolean;
  expiresInMinutes: number;
  sharedWithMemberIds: string[];
  statusLabel?: string;
  approximateArea: string;
}) {
  const parsed = enableLocationShareSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Explicit consent required.",
    };
  }

  const { supabase, actor } = await getSafetyActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + parsed.data.expiresInMinutes * 60_000
  ).toISOString();

  const { error } = await supabase.from("safety_location_shares").upsert(
    {
      family_id: parsed.data.familyId,
      member_id: actor.id,
      is_enabled: true,
      consent_acknowledged_at: now.toISOString(),
      expires_at: expiresAt,
      shared_with_member_ids: parsed.data.sharedWithMemberIds,
      status_label: parsed.data.statusLabel,
      approximate_area: parsed.data.approximateArea,
      last_updated_at: now.toISOString(),
      revoked_at: null,
    },
    { onConflict: "family_id,member_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "safety"));
  return { ok: true, expiresAt };
}

export async function revokeLocationShareAction(input: { familyId: string }) {
  const { supabase, actor } = await getSafetyActor(input.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase
    .from("safety_location_shares")
    .update({
      is_enabled: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("family_id", input.familyId)
    .eq("member_id", actor.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(input.familyId, "safety"));
  return { ok: true };
}
