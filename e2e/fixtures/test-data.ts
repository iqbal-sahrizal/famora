import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TestUserFixture {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export interface Phase1Fixtures {
  runId: string;
  userA: TestUserFixture; // Owner of Family A
  userB: TestUserFixture; // Adult member of Family A
  userC: TestUserFixture; // Owner of Family B
  userD: TestUserFixture; // Authenticated user without membership in A or B
  familyAId: string;
  familyAName: string;
  familyBId: string;
  familyBName: string;
}

export function getIsolatedSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasIsolatedE2EAdmin(): boolean {
  return Boolean(
    (process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

async function createConfirmedUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  displayName: string
): Promise<TestUserFixture> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  return { id: data.user.id, email, password, displayName };
}

export async function seedPhase1Fixtures(): Promise<Phase1Fixtures> {
  const admin = getIsolatedSupabaseAdmin();
  if (!admin) {
    throw new Error(
      "Missing E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY for isolated fixture seeding."
    );
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const password = `FamoraTest!${runId}`;

  const [userA, userB, userC, userD] = await Promise.all([
    createConfirmedUser(admin, `usera.${runId}@famora.test`, password, "User A Owner"),
    createConfirmedUser(admin, `userb.${runId}@famora.test`, password, "User B Adult"),
    createConfirmedUser(admin, `userc.${runId}@famora.test`, password, "User C OwnerB"),
    createConfirmedUser(admin, `userd.${runId}@famora.test`, password, "User D Outsider"),
  ]);

  const { data: roles } = await admin
    .from("family_roles")
    .select("id, role_key")
    .is("family_id", null);
  const ownerRoleId = roles?.find((r) => r.role_key === "owner")?.id;
  const adultRoleId = roles?.find((r) => r.role_key === "adult")?.id;
  if (!ownerRoleId || !adultRoleId) {
    throw new Error("Default family_roles (owner/adult) not seeded in test DB.");
  }

  const familyAName = `Test Family A (${runId})`;
  const familyBName = `Test Family B (${runId})`;

  const [{ data: famA }, { data: famB }] = await Promise.all([
    admin
      .from("families")
      .insert({
        name: familyAName,
        currency_code: "IDR",
        timezone: "Asia/Jakarta",
        created_by: userA.id,
      })
      .select("id")
      .single<{ id: string }>(),
    admin
      .from("families")
      .insert({
        name: familyBName,
        currency_code: "USD",
        timezone: "UTC",
        created_by: userC.id,
      })
      .select("id")
      .single<{ id: string }>(),
  ]);

  if (!famA || !famB) {
    throw new Error("Failed to insert isolated test families.");
  }

  await admin.from("family_members").insert([
    {
      family_id: famA.id,
      user_id: userA.id,
      role_id: ownerRoleId,
      display_name: userA.displayName,
      status: "active",
    },
    {
      family_id: famA.id,
      user_id: userB.id,
      role_id: adultRoleId,
      display_name: userB.displayName,
      status: "active",
    },
    {
      family_id: famB.id,
      user_id: userC.id,
      role_id: ownerRoleId,
      display_name: userC.displayName,
      status: "active",
    },
  ]);

  return {
    runId,
    userA,
    userB,
    userC,
    userD,
    familyAId: famA.id,
    familyAName,
    familyBId: famB.id,
    familyBName,
  };
}

export async function cleanupPhase1Fixtures(
  fixtures: Phase1Fixtures | null
): Promise<void> {
  if (!fixtures) return;
  const admin = getIsolatedSupabaseAdmin();
  if (!admin) return;

  await admin
    .from("families")
    .delete()
    .in("id", [fixtures.familyAId, fixtures.familyBId]);

  await Promise.all([
    admin.auth.admin.deleteUser(fixtures.userA.id),
    admin.auth.admin.deleteUser(fixtures.userB.id),
    admin.auth.admin.deleteUser(fixtures.userC.id),
    admin.auth.admin.deleteUser(fixtures.userD.id),
  ]);
}
