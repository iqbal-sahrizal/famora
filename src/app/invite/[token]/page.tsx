import { Container } from "@/components/layout/primitives";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { InviteAcceptanceCard } from "@/features/members/components/invite-acceptance-card";
import { getInvitationPreviewByToken } from "@/features/members/server";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await requireAuthenticatedUser(`/invite/${encodeURIComponent(token)}`);
  const preview = await getInvitationPreviewByToken(token);

  return (
    <Container className="flex min-h-[80vh] items-center justify-center py-12">
      <InviteAcceptanceCard token={token} preview={preview} />
    </Container>
  );
}
