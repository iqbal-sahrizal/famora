import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyCalendarView } from "@/features/calendar/components/family-calendar-view";
import { getCalendarPageData } from "@/features/calendar/server";
import { routes } from "@/lib/routes";

export default async function FamilyCalendarPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "calendar")
  );
  const data = await getCalendarPageData(familyId, user.id);

  return <FamilyCalendarView familyId={familyId} data={data} />;
}
