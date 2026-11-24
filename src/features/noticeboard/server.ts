import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FamilyRole } from "@/types/domain";

export interface NoticeboardAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: "all" | "adults_only" | "children_teens";
  pinned: boolean;
  isArchived: boolean;
  authorName: string;
  canEditOrDelete: boolean;
  attachments: Array<{ name: string }>;
  attachmentStoragePath: string | null;
  readCount: number;
  hasRead: boolean;
  createdAt: string;
}

export interface NoticeboardPoll {
  id: string;
  question: string;
  description: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  allowVoteEdit: boolean;
  visibility: "family" | "adults_only";
  expiresAt: string | null;
  isClosed: boolean;
  canEditOrDelete: boolean;
  totalVotes: number;
  mySelectedOptionIds: string[];
  options: Array<{
    id: string;
    label: string;
    voteCount: number;
    voterNames: string[];
  }>;
}

export interface NoticeboardData {
  canPublish: boolean;
  canTargetAdultsOnly: boolean;
  announcements: NoticeboardAnnouncement[];
  polls: NoticeboardPoll[];
}

export async function getNoticeboardData(
  familyId: string,
  userId: string
): Promise<NoticeboardData> {
  const empty: NoticeboardData = {
    canPublish: false,
    canTargetAdultsOnly: false,
    announcements: [],
    polls: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const [
      { data: membersData },
      { data: annData },
      { data: readsData },
      { data: pollsData },
      { data: voteCountsData },
      { data: visibleVotesData },
    ] = await Promise.all([
      supabase
        .from("family_members")
        .select("id, user_id, display_name, family_roles!inner(role_key)")
        .eq("family_id", familyId)
        .eq("status", "active"),
      supabase
        .from("family_announcements")
        .select("id, title, body, audience, pinned, is_archived, author_member_id, attachments_jsonb, attachment_storage_path, created_at")
        .eq("family_id", familyId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("announcement_reads")
        .select("announcement_id, member_id")
        .eq("family_id", familyId),
      supabase
        .from("family_polls")
        .select(
          `
          id, question, description, allow_multiple, is_anonymous, allow_vote_edit,
          visibility, expires_at, is_closed, created_by_member_id,
          family_poll_options(id, label, sort_order)
        `
        )
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_poll_vote_counts", { p_family_id: familyId }),
      supabase
        .from("family_poll_votes")
        .select("poll_id, option_id, voter_member_id")
        .eq("family_id", familyId),
    ]);

    const members = (
      (membersData as unknown as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
        family_roles: { role_key: FamilyRole };
      }>) ?? []
    );
    const memberMap = new Map(members.map((m) => [m.id, m.display_name]));
    const currentMember = members.find((m) => m.user_id === userId) ?? null;
    const roleKey = currentMember?.family_roles.role_key ?? null;
    const canPublish = roleKey === "owner" || roleKey === "admin" || roleKey === "adult";
    const isAdminOrOwner = roleKey === "owner" || roleKey === "admin";

    const reads = (readsData ?? []) as Array<{
      announcement_id: string;
      member_id: string;
    }>;

    const announcements: NoticeboardAnnouncement[] = (annData ?? []).map((a) => {
      const annReads = reads.filter((r) => r.announcement_id === a.id);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        pinned: a.pinned,
        isArchived: a.is_archived,
        authorName: a.author_member_id
          ? memberMap.get(a.author_member_id) ?? "Family Adult"
          : "Family Adult",
        canEditOrDelete: Boolean(
          currentMember &&
            canPublish &&
            (isAdminOrOwner || a.author_member_id === currentMember.id)
        ),
        attachments: Array.isArray(a.attachments_jsonb)
          ? (a.attachments_jsonb as Array<{ name: string }>)
          : [],
        attachmentStoragePath:
          (a as { attachment_storage_path?: string | null }).attachment_storage_path ??
          null,
        readCount: annReads.length,
        hasRead: currentMember
          ? annReads.some((r) => r.member_id === currentMember.id)
          : false,
        createdAt: a.created_at,
      };
    });

    const countMap = new Map<string, number>();
    for (const vc of (voteCountsData as Array<{ option_id: string; vote_count: number }>) ?? []) {
      countMap.set(vc.option_id, vc.vote_count);
    }

    const visibleVotes = (visibleVotesData ?? []) as Array<{
      poll_id: string;
      option_id: string;
      voter_member_id: string;
    }>;

    const polls: NoticeboardPoll[] = (
      (pollsData as unknown as Array<{
        id: string;
        question: string;
        description: string;
        allow_multiple: boolean;
        is_anonymous: boolean;
        allow_vote_edit: boolean;
        visibility: "family" | "adults_only";
        expires_at: string | null;
        is_closed: boolean;
        created_by_member_id: string | null;
        family_poll_options: Array<{ id: string; label: string; sort_order: number }>;
      }>) ?? []
    ).map((p) => {
      const sortedOpts = [...(p.family_poll_options ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      const options = sortedOpts.map((opt) => ({
        id: opt.id,
        label: opt.label,
        voteCount: countMap.get(opt.id) ?? 0,
        voterNames: p.is_anonymous
          ? []
          : visibleVotes
              .filter((v) => v.option_id === opt.id)
              .map((v) => memberMap.get(v.voter_member_id) ?? "Member"),
      }));

      const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);
      const mySelectedOptionIds = currentMember
        ? visibleVotes
            .filter((v) => v.poll_id === p.id && v.voter_member_id === currentMember.id)
            .map((v) => v.option_id)
        : [];

      return {
        id: p.id,
        question: p.question,
        description: p.description,
        allowMultiple: p.allow_multiple,
        isAnonymous: p.is_anonymous,
        allowVoteEdit: p.allow_vote_edit,
        visibility: p.visibility,
        expiresAt: p.expires_at,
        isClosed: p.is_closed,
        canEditOrDelete: Boolean(
          currentMember &&
            canPublish &&
            (isAdminOrOwner || p.created_by_member_id === currentMember.id)
        ),
        totalVotes,
        mySelectedOptionIds,
        options,
      };
    });

    return {
      canPublish,
      canTargetAdultsOnly: canPublish,
      announcements,
      polls,
    };
  } catch {
    return empty;
  }
}
