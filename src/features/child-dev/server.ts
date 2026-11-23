import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ChildProfileItem {
  id: string;
  displayName: string;
  birthDate: string;
  birthPlace: string;
  schoolName: string;
  gradeLevel: string;
  teacherName: string;
}

export interface ChildDevPageData {
  canViewIdentity: boolean;
  canManageGrowthMilestones: boolean;
  canViewHealth: boolean;
  profiles: ChildProfileItem[];
  growthRecords: Array<{
    id: string;
    childProfileId: string;
    measuredOn: string;
    heightCm: number;
    weightKg: number;
    notes: string;
  }>;
  milestones: Array<{
    id: string;
    childProfileId: string;
    category: string;
    title: string;
    description: string;
    achievedOn: string;
    photoAttachmentName: string | null;
  }>;
  educationRecords: Array<{
    id: string;
    childProfileId: string;
    recordType: string;
    title: string;
    details: string;
    eventDate: string | null;
  }>;
  healthRecords: Array<{
    id: string;
    childProfileId: string;
    recordType: string;
    title: string;
    providerName: string;
    recordedOn: string;
    notes: string;
  }>;
  attachments: Array<{
    id: string;
    childProfileId: string;
    recordType: "health" | "education" | "milestone";
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    notes: string;
    createdAt: string;
  }>;
}

export async function getChildDevPageData(familyId: string): Promise<ChildDevPageData> {
  const denied: ChildDevPageData = {
    canViewIdentity: false,
    canManageGrowthMilestones: false,
    canViewHealth: false,
    profiles: [],
    growthRecords: [],
    milestones: [],
    educationRecords: [],
    healthRecords: [],
    attachments: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: string }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const canViewIdentity = permSet.has("child_dev.identity.view");
    const canManageGrowthMilestones = permSet.has("child_dev.growth_milestones.manage");
    const canViewHealth = permSet.has("child_dev.health.view");

    if (!canViewIdentity) return denied;

    const [
      { data: profilesData },
      { data: growthData },
      { data: milestonesData },
      { data: eduData },
      healthRes,
      { data: attachmentsData },
    ] = await Promise.all([
      supabase
        .from("child_profiles")
        .select("id, display_name, birth_date, birth_place, school_name, grade_level, teacher_name")
        .eq("family_id", familyId)
        .order("birth_date", { ascending: false }),
      supabase
        .from("child_growth_records")
        .select("id, child_profile_id, measured_on, height_cm, weight_kg, notes")
        .eq("family_id", familyId)
        .order("measured_on", { ascending: true }),
      supabase
        .from("child_milestones")
        .select("id, child_profile_id, category, title, description, achieved_on, photo_attachment_name")
        .eq("family_id", familyId)
        .order("achieved_on", { ascending: false }),
      supabase
        .from("child_education_records")
        .select("id, child_profile_id, record_type, title, details, event_date")
        .eq("family_id", familyId)
        .order("event_date", { ascending: false }),
      canViewHealth
        ? supabase
            .from("child_health_records")
            .select("id, child_profile_id, record_type, title, provider_name, recorded_on, notes")
            .eq("family_id", familyId)
            .order("recorded_on", { ascending: false })
        : Promise.resolve({ data: null }),
      supabase
        .from("child_attachments")
        .select("id, child_profile_id, record_type, file_name, mime_type, size_bytes, notes, created_at")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      canViewIdentity,
      canManageGrowthMilestones,
      canViewHealth,
      profiles: (profilesData ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        birthDate: p.birth_date,
        birthPlace: p.birth_place ?? "",
        schoolName: p.school_name ?? "",
        gradeLevel: p.grade_level ?? "",
        teacherName: p.teacher_name ?? "",
      })),
      growthRecords: (growthData ?? []).map((g) => ({
        id: g.id,
        childProfileId: g.child_profile_id,
        measuredOn: g.measured_on,
        heightCm: Number(g.height_cm),
        weightKg: Number(g.weight_kg),
        notes: g.notes ?? "",
      })),
      milestones: (milestonesData ?? []).map((m) => ({
        id: m.id,
        childProfileId: m.child_profile_id,
        category: m.category,
        title: m.title,
        description: m.description ?? "",
        achievedOn: m.achieved_on,
        photoAttachmentName: m.photo_attachment_name,
      })),
      educationRecords: (eduData ?? []).map((e) => ({
        id: e.id,
        childProfileId: e.child_profile_id,
        recordType: e.record_type,
        title: e.title,
        details: e.details ?? "",
        eventDate: e.event_date,
      })),
      healthRecords: ((healthRes.data ?? []) as Array<{
        id: string;
        child_profile_id: string;
        record_type: string;
        title: string;
        provider_name: string;
        recorded_on: string;
        notes: string;
      }>).map((h) => ({
        id: h.id,
        childProfileId: h.child_profile_id,
        recordType: h.record_type,
        title: h.title,
        providerName: h.provider_name ?? "",
        recordedOn: h.recorded_on,
        notes: h.notes ?? "",
      })),
      attachments: (
        (attachmentsData as Array<{
          id: string;
          child_profile_id: string;
          record_type: "health" | "education" | "milestone";
          file_name: string;
          mime_type: string;
          size_bytes: number;
          notes: string;
          created_at: string;
        }>) ?? []
      )
        .filter((a) => a.record_type !== "health" || canViewHealth)
        .map((a) => ({
          id: a.id,
          childProfileId: a.child_profile_id,
          recordType: a.record_type,
          fileName: a.file_name,
          mimeType: a.mime_type,
          sizeBytes: a.size_bytes,
          notes: a.notes ?? "",
          createdAt: a.created_at,
        })),
    };
  } catch {
    return denied;
  }
}
