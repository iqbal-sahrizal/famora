"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addEducationRecordSchema,
  addGrowthRecordSchema,
  addHealthRecordSchema,
  addMilestoneSchema,
  createChildProfileSchema,
  deleteChildRecordSchema,
  updateChildProfileSchema,
  updateEducationRecordSchema,
  updateGrowthRecordSchema,
  updateHealthRecordSchema,
  updateMilestoneSchema,
  uploadChildAttachmentMetaSchema,
  validateChildAttachmentFile,
  type AddEducationRecordInput,
  type AddGrowthRecordInput,
  type AddHealthRecordInput,
  type AddMilestoneInput,
  type CreateChildProfileInput,
} from "./schemas";

async function checkChildPermission(familyId: string, permissionKey: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });
  const allowed = ((data as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === permissionKey
  );
  return { supabase, allowed };
}

export async function createChildProfileAction(input: CreateChildProfileInput) {
  await requireAuthenticatedUser();
  const parsed = createChildProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid child profile." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.manage" };

    const { error } = await supabase.from("child_profiles").insert({
      family_id: parsed.data.familyId,
      display_name: parsed.data.displayName,
      birth_date: parsed.data.birthDate,
      birth_place: parsed.data.birthPlace,
      school_name: parsed.data.schoolName,
      grade_level: parsed.data.gradeLevel,
      teacher_name: parsed.data.teacherName,
      ai_training_opt_out: true,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create profile." };
  }
}

export async function addGrowthRecordAction(input: AddGrowthRecordInput) {
  await requireAuthenticatedUser();
  const parsed = addGrowthRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid growth record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };

    const { error } = await supabase.from("child_growth_records").insert({
      family_id: parsed.data.familyId,
      child_profile_id: parsed.data.childProfileId,
      measured_on: parsed.data.measuredOn,
      height_cm: parsed.data.heightCm,
      weight_kg: parsed.data.weightKg,
      notes: parsed.data.notes,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add growth record." };
  }
}

export async function addMilestoneAction(input: AddMilestoneInput) {
  await requireAuthenticatedUser();
  const parsed = addMilestoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid milestone." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };

    const { error } = await supabase.from("child_milestones").insert({
      family_id: parsed.data.familyId,
      child_profile_id: parsed.data.childProfileId,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      achieved_on: parsed.data.achievedOn,
      photo_attachment_name: parsed.data.photoAttachmentName,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add milestone." };
  }
}

export async function addEducationRecordAction(input: AddEducationRecordInput) {
  await requireAuthenticatedUser();
  const parsed = addEducationRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid education record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };

    const { error } = await supabase.from("child_education_records").insert({
      family_id: parsed.data.familyId,
      child_profile_id: parsed.data.childProfileId,
      record_type: parsed.data.recordType,
      title: parsed.data.title,
      details: parsed.data.details,
      event_date: parsed.data.eventDate,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add education record." };
  }
}

export async function addHealthRecordAction(input: AddHealthRecordInput) {
  await requireAuthenticatedUser();
  const parsed = addHealthRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid health record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.health.view"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.health.view" };

    const { error } = await supabase.from("child_health_records").insert({
      family_id: parsed.data.familyId,
      child_profile_id: parsed.data.childProfileId,
      record_type: parsed.data.recordType,
      title: parsed.data.title,
      provider_name: parsed.data.providerName,
      recorded_on: parsed.data.recordedOn,
      notes: parsed.data.notes,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add health record." };
  }
}

const attachmentIdSchema = z.object({
  familyId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export async function uploadChildAttachmentAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Select a file to upload." };
  }

  const parsed = uploadChildAttachmentMetaSchema.safeParse({
    familyId: formData.get("familyId"),
    childProfileId: formData.get("childProfileId"),
    recordType: formData.get("recordType"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid attachment details.",
    };
  }

  const fileCheck = validateChildAttachmentFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!fileCheck.valid || !fileCheck.safeName) {
    return { ok: false, error: fileCheck.error ?? "Invalid file." };
  }

  try {
    const requiredPerm =
      parsed.data.recordType === "health"
        ? "child_dev.health.view"
        : "child_dev.growth_milestones.manage";
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      requiredPerm
    );
    if (!allowed) {
      return { ok: false, error: `Missing permission: ${requiredPerm}` };
    }

    const [{ data: childProfile }, { data: actor }] = await Promise.all([
      supabase
        .from("child_profiles")
        .select("id")
        .eq("id", parsed.data.childProfileId)
        .eq("family_id", parsed.data.familyId)
        .maybeSingle<{ id: string }>(),
      supabase
        .from("family_members")
        .select("id")
        .eq("family_id", parsed.data.familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>(),
    ]);

    if (!childProfile) {
      return { ok: false, error: "Child profile not found in this family." };
    }

    const storagePath = `${parsed.data.familyId}/${parsed.data.childProfileId}/${crypto.randomUUID()}-${fileCheck.safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("family-child-attachments")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    const { error: insertError } = await supabase
      .from("child_attachments")
      .insert({
        family_id: parsed.data.familyId,
        child_profile_id: parsed.data.childProfileId,
        record_type: parsed.data.recordType,
        file_name: fileCheck.safeName,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        notes: parsed.data.notes,
        uploaded_by_member_id: actor?.id ?? null,
      });

    if (insertError) {
      // Clean up orphaned storage file on metadata insert failure
      await supabase.storage
        .from("family-child-attachments")
        .remove([storagePath]);
      return { ok: false, error: insertError.message };
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to upload attachment.",
    };
  }
}

export async function getChildAttachmentSignedUrlAction(input: {
  familyId: string;
  attachmentId: string;
}) {
  await requireAuthenticatedUser();
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid attachment identifier." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: string }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const { data: att, error } = await supabase
      .from("child_attachments")
      .select("id, record_type, storage_path")
      .eq("id", parsed.data.attachmentId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{
        id: string;
        record_type: "health" | "education" | "milestone";
        storage_path: string;
      }>();

    if (error) return { ok: false, error: error.message };
    if (!att) return { ok: false, error: "Attachment not found." };

    const requiredPerm =
      att.record_type === "health"
        ? "child_dev.health.view"
        : "child_dev.identity.view";
    if (!permSet.has(requiredPerm)) {
      return { ok: false, error: `Missing permission: ${requiredPerm}` };
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("family-child-attachments")
      .createSignedUrl(att.storage_path, 60);

    if (signErr || !signed?.signedUrl) {
      return { ok: false, error: signErr?.message ?? "Could not generate signed URL." };
    }

    return { ok: true, signedUrl: signed.signedUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to sign attachment URL.",
    };
  }
}

export async function deleteChildAttachmentAction(input: {
  familyId: string;
  attachmentId: string;
}) {
  await requireAuthenticatedUser();
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid attachment identifier." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: string }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const { data: att, error: fetchErr } = await supabase
      .from("child_attachments")
      .select("id, record_type, storage_path")
      .eq("id", parsed.data.attachmentId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{
        id: string;
        record_type: "health" | "education" | "milestone";
        storage_path: string;
      }>();

    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!att) return { ok: false, error: "Attachment not found." };

    const requiredPerm =
      att.record_type === "health"
        ? "child_dev.health.view"
        : "child_dev.growth_milestones.manage";
    if (!permSet.has(requiredPerm)) {
      return { ok: false, error: `Missing permission: ${requiredPerm}` };
    }

    const { error: delErr } = await supabase
      .from("child_attachments")
      .delete()
      .eq("id", att.id)
      .eq("family_id", parsed.data.familyId);

    if (delErr) return { ok: false, error: delErr.message };

    await supabase.storage
      .from("family-child-attachments")
      .remove([att.storage_path]);

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete attachment.",
    };
  }
}

export async function updateChildProfileAction(
  input: z.infer<typeof updateChildProfileSchema>
) {
  await requireAuthenticatedUser();
  const parsed = updateChildProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid child profile." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.manage" };

    const { data, error } = await supabase
      .from("child_profiles")
      .update({
        display_name: parsed.data.displayName,
        birth_date: parsed.data.birthDate,
        birth_place: parsed.data.birthPlace,
        school_name: parsed.data.schoolName,
        grade_level: parsed.data.gradeLevel,
        teacher_name: parsed.data.teacherName,
      })
      .eq("id", parsed.data.profileId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Child profile not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update profile." };
  }
}

export async function deleteChildProfileAction(
  input: z.infer<typeof deleteChildRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = deleteChildRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.manage"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.manage" };

    const { data, error } = await supabase
      .from("child_profiles")
      .delete()
      .eq("id", parsed.data.id)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Child profile not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete profile." };
  }
}

export async function updateGrowthRecordAction(
  input: z.infer<typeof updateGrowthRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = updateGrowthRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid growth record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_growth_records")
      .update({
        measured_on: parsed.data.measuredOn,
        height_cm: parsed.data.heightCm,
        weight_kg: parsed.data.weightKg,
        notes: parsed.data.notes,
      })
      .eq("id", parsed.data.recordId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Growth record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update growth record." };
  }
}

export async function deleteGrowthRecordAction(
  input: z.infer<typeof deleteChildRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = deleteChildRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_growth_records")
      .delete()
      .eq("id", parsed.data.id)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Growth record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete growth record." };
  }
}

export async function updateMilestoneAction(
  input: z.infer<typeof updateMilestoneSchema>
) {
  await requireAuthenticatedUser();
  const parsed = updateMilestoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid milestone." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_milestones")
      .update({
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        achieved_on: parsed.data.achievedOn,
        photo_attachment_name: parsed.data.photoAttachmentName,
      })
      .eq("id", parsed.data.milestoneId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Milestone not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update milestone." };
  }
}

export async function deleteMilestoneAction(
  input: z.infer<typeof deleteChildRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = deleteChildRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_milestones")
      .delete()
      .eq("id", parsed.data.id)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Milestone not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete milestone." };
  }
}

export async function updateEducationRecordAction(
  input: z.infer<typeof updateEducationRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = updateEducationRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid education record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_education_records")
      .update({
        record_type: parsed.data.recordType,
        title: parsed.data.title,
        details: parsed.data.details,
        event_date: parsed.data.eventDate,
      })
      .eq("id", parsed.data.recordId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Education record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update education record." };
  }
}

export async function deleteEducationRecordAction(
  input: z.infer<typeof deleteChildRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = deleteChildRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.growth_milestones.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: child_dev.growth_milestones.manage" };
    }

    const { data, error } = await supabase
      .from("child_education_records")
      .delete()
      .eq("id", parsed.data.id)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Education record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete education record." };
  }
}

export async function updateHealthRecordAction(
  input: z.infer<typeof updateHealthRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = updateHealthRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid health record." };
  }

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.health.view"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.health.view" };

    const { data, error } = await supabase
      .from("child_health_records")
      .update({
        record_type: parsed.data.recordType,
        title: parsed.data.title,
        provider_name: parsed.data.providerName,
        recorded_on: parsed.data.recordedOn,
        notes: parsed.data.notes,
      })
      .eq("id", parsed.data.recordId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Health record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update health record." };
  }
}

export async function deleteHealthRecordAction(
  input: z.infer<typeof deleteChildRecordSchema>
) {
  await requireAuthenticatedUser();
  const parsed = deleteChildRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { supabase, allowed } = await checkChildPermission(
      parsed.data.familyId,
      "child_dev.health.view"
    );
    if (!allowed) return { ok: false, error: "Missing permission: child_dev.health.view" };

    const { data, error } = await supabase
      .from("child_health_records")
      .delete()
      .eq("id", parsed.data.id)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Health record not found or access denied." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "child-dev"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete health record." };
  }
}
