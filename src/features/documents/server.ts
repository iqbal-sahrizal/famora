import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

export type DocumentCategory =
  | "identity"
  | "certificates"
  | "education"
  | "insurance"
  | "property"
  | "vehicles"
  | "financial"
  | "other";

export interface VaultDocumentItem {
  id: string;
  title: string;
  category: DocumentCategory;
  sensitivity: "standard" | "sensitive_vault";
  mimeType: string;
  sizeBytes: number;
  expiresOn: string | null;
  expirationState: "valid" | "expiring_soon" | "expired" | "none";
  notes: string;
  ownerName: string;
  sharedWithCount: number;
  createdAt: string;
}

export interface DocumentsPageData {
  canViewStandard: boolean;
  canViewVault: boolean;
  members: Array<{ id: string; displayName: string }>;
  documents: VaultDocumentItem[];
  history: Array<{
    id: string;
    documentTitle: string;
    eventType: string;
    createdAt: string;
  }>;
}

function classifyExpiration(expiresOn: string | null): VaultDocumentItem["expirationState"] {
  if (!expiresOn) return "none";
  const now = new Date();
  const exp = new Date(`${expiresOn}T00:00:00Z`);
  const diffDays = Math.round((exp.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "valid";
}

export async function getDocumentsPageData(
  familyId: string
): Promise<DocumentsPageData> {
  const denied: DocumentsPageData = {
    canViewStandard: false,
    canViewVault: false,
    members: [],
    documents: [],
    history: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const canViewStandard = permSet.has("documents.standard.manage");
    const canViewVault = permSet.has("documents.sensitive_vault");
    if (!canViewStandard && !canViewVault) return denied;

    const [{ data: membersData }, { data: docsData }, { data: histData }] =
      await Promise.all([
        supabase
          .from("family_members")
          .select("id, display_name")
          .eq("family_id", familyId)
          .eq("status", "active"),
        supabase
          .from("documents")
          .select(
            "id, title, category, sensitivity, mime_type, size_bytes, expires_on, notes, owner_member_id, shared_with_member_ids, created_at"
          )
          .eq("family_id", familyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("document_history")
          .select("id, event_type, created_at, documents(title)")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const members = ((membersData ?? []) as Array<{ id: string; display_name: string }>).map(
      (m) => ({ id: m.id, displayName: m.display_name })
    );
    const memberMap = new Map(members.map((m) => [m.id, m.displayName]));

    return {
      canViewStandard,
      canViewVault,
      members,
      documents: (docsData ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        sensitivity: d.sensitivity,
        mimeType: d.mime_type,
        sizeBytes: Number(d.size_bytes),
        expiresOn: d.expires_on,
        expirationState: classifyExpiration(d.expires_on),
        notes: d.notes ?? "",
        ownerName: d.owner_member_id
          ? memberMap.get(d.owner_member_id) ?? "Member"
          : "Member",
        sharedWithCount: Array.isArray(d.shared_with_member_ids)
          ? d.shared_with_member_ids.length
          : 0,
        createdAt: d.created_at,
      })),
      history: (
        (histData as unknown as Array<{
          id: string;
          event_type: string;
          created_at: string;
          documents: { title: string } | null;
        }>) ?? []
      ).map((h) => ({
        id: h.id,
        documentTitle: h.documents?.title ?? "Document",
        eventType: h.event_type,
        createdAt: h.created_at,
      })),
    };
  } catch {
    return denied;
  }
}
