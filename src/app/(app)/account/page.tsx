import { AccountSettingsView } from "@/features/auth/components/account-settings-view";
import {
  ensureProfileInitialized,
  requireAuthenticatedUser,
} from "@/features/auth/server";
import { routes } from "@/lib/routes";

export default async function AccountPage() {
  const user = await requireAuthenticatedUser(routes.account);
  const profile = await ensureProfileInitialized(user);

  return (
    <AccountSettingsView
      email={user.email ?? ""}
      initialProfile={{
        fullName: profile?.full_name ?? user.email?.split("@")[0] ?? "Member",
        defaultTimezone: profile?.default_timezone ?? "UTC",
        locale: profile?.locale ?? "id-ID",
      }}
    />
  );
}
