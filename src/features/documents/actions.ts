"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateDocumentFile } from "./validation";

const uploadMetaSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required.").max(140),
  category: z.enum([
    "identity",
    "certificates",
    "education",
    "insurance",
    "property",
    "vehicles",
    "financial",
    "other",
  ]),
  sensitivity: z.enum(["standard", "sensitive_vault"]).default("standard"),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: z.string().trim().max(800).default(""),
});

export async function uploadDocumentAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Select a file to upload." };
  }

  const parsed = uploadMetaSchema.safeParse({
    familyId: formData.get("familyId"),
    title: formData.get("title"),
    category: formData.get("category"),
    sensitivity: formData.get("sensitivity") ?? "standard",
    expiresOn: formData.get("expiresOn") ? String(formData.get("expiresOn")) : null,
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document details." };
  }

  const fileCheck = validateDocumentFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!fileCheck.valid || !fileCheck.safeName) {
    return { ok: false, error: fileCheck.error ?? "Invalid file." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: string }>) ?? []).map((p) => p.permission_key)
    );

    const requiredPerm =
      parsed.data.sensitivity === "sensitive_vault"
        ? "documents.sensitive_vault"
        : "documents.standard.manage";

    if (!permSet.has(requiredPerm)) {
      return { ok: false, error: `Missing permission: ${requiredPerm}` };
    }

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const tierFolder = parsed.data.sensitivity === "sensitive_vault" ? "vault" : "standard";
    const storagePath = `${parsed.data.familyId}/${tierFolder}/${crypto.randomUUID()}-${fileCheck.safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from("family-documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) return { ok: false, error: uploadErr.message };

    const { data: doc, error: dbErr } = await supabase
      .from("documents")
      .insert({
        family_id: parsed.data.familyId,
        owner_member_id: actor?.id ?? null,
        title: parsed.data.title,
        category: parsed.data.category,
        sensitivity: parsed.data.sensitivity,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        expires_on: parsed.data.expiresOn,
        notes: parsed.data.notes,
      })
      .select("id")
      .single<{ id: string }>();

    if (dbErr || !doc) {
      await supabase.storage.from("family-documents").remove([storagePath]);
      return { ok: false, error: dbErr?.message ?? "Failed to save document metadata." };
    }

    await supabase.from("document_history").insert({
      family_id: parsed.data.familyId,
      document_id: doc.id,
      actor_member_id: actor?.id ?? null,
      event_type: "uploaded",
    });

    if (parsed.data.expiresOn && actor) {
      const remindAt = new Date(`${parsed.data.expiresOn}T09:00:00Z`);
      remindAt.setUTCDate(remindAt.getUTCDate() - 30);
      await supabase.from("notifications").insert({
        family_id: parsed.data.familyId,
        recipient_member_id: actor.id,
        category: "document_expiration",
        domain: "documents",
        title: `Document expiring soon: ${parsed.data.title}`,
        body: `Expires on ${parsed.data.expiresOn}`,
        deep_link: routes.familyDomain(parsed.data.familyId, "documents"),
        scheduled_for: remindAt.toISOString(),
      });
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "documents"));
    return { ok: true, documentId: doc.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Document upload failed.",
    };
  }
}

export async function getDocumentSignedUrlAction(params: {
  familyId: string;
  documentId: string;
  mode: "preview" | "download";
}) {
  const user = await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: perms }, { data: doc }, { data: actor }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: params.familyId }),
      supabase
        .from("documents")
        .select("id, storage_path, sensitivity, owner_member_id, shared_with_member_ids")
        .eq("id", params.documentId)
        .eq("family_id", params.familyId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("family_members")
        .select("id")
        .eq("family_id", params.familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>(),
    ]);

    if (!doc) return { ok: false, error: "Document not found or access denied." };

    const permSet = new Set(
      ((perms as Array<{ permission_key: string }>) ?? []).map((p) => p.permission_key)
    );

    if (doc.sensitivity === "sensitive_vault" && !permSet.has("documents.sensitive_vault")) {
      return { ok: false, error: "Missing permission: documents.sensitive_vault" };
    }

    const isShared =
      actor &&
      Array.isArray(doc.shared_with_member_ids) &&
      doc.shared_with_member_ids.includes(actor.id);
    const isOwner = actor && doc.owner_member_id === actor.id;

    if (
      doc.sensitivity === "standard" &&
      !permSet.has("documents.standard.manage") &&
      !isShared &&
      !isOwner
    ) {
      return { ok: false, error: "Missing permission: documents.standard.manage" };
    }

    // Short-lived 120-second signed URL for private bucket
    const { data: signed, error } = await supabase.storage
      .from("family-documents")
      .createSignedUrl(doc.storage_path, 120, {
        download: params.mode === "download",
      });

    if (error || !signed?.signedUrl) {
      return { ok: false, error: error?.message ?? "Could not generate signed URL." };
    }

    await supabase.from("document_history").insert({
      family_id: params.familyId,
      document_id: doc.id,
      actor_member_id: actor?.id ?? null,
      event_type: params.mode === "download" ? "downloaded" : "viewed",
    });

    return { ok: true, signedUrl: signed.signedUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to access document.",
    };
  }
}

export async function deleteDocumentAction(params: {
  familyId: string;
  documentId: string;
}) {
  const user = await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: doc } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", params.documentId)
      .eq("family_id", params.familyId)
      .maybeSingle();

    if (!doc) return { ok: false, error: "Document not found." };

    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.documentId)
      .eq("family_id", params.familyId);

    if (error) return { ok: false, error: error.message };

    await supabase.storage.from("family-documents").remove([doc.storage_path]);

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", params.familyId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>();

    await supabase.from("document_history").insert({
      family_id: params.familyId,
      document_id: doc.id,
      actor_member_id: actor?.id ?? null,
      event_type: "deleted",
    });

    revalidatePath(routes.familyDomain(params.familyId, "documents"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete document.",
    };
  }
}
