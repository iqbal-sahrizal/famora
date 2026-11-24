import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_0038_PATH = path.join(
  process.cwd(),
  "supabase/migrations/0038_security_function_hardening.sql"
);

describe("Famora R6.5 — 0038 Security Function Hardening Migration", () => {
  const sql = fs.readFileSync(MIGRATION_0038_PATH, "utf8");

  it("pins pg_temp on famora.is_chat_participant and all redefined SECURITY DEFINER functions", () => {
    expect(sql).toContain("ALTER FUNCTION famora.is_chat_participant(UUID)");
    expect(sql).toContain("SET search_path = public, famora, pg_temp");
    expect(sql).toContain("SET search_path = public, pg_temp");
  });

  it("serializes reward redemption and poll voting with locks to prevent double-spend and vote races", () => {
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtext('reward_redeem:'");
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtext('poll_vote:'");
    expect(sql).toContain("FROM public.family_polls WHERE id = p_poll_id FOR SHARE");
  });

  it("enforces personal-account ownership, sorted locking, archived guard, and debt settlement invariants", () => {
    expect(sql).toContain("v_dst.ownership_scope = 'personal' AND v_dst.owner_member_id <> v_member_id");
    expect(sql).toContain("Source account is archived");
    expect(sql).toContain("Destination account is archived");
    expect(sql).toContain("Not authorized to reverse transaction on another member personal account");
    expect(sql).toContain("Debt/receivable is already settled");
    expect(sql).toContain("Payment exceeds remaining balance");
  });

  it("restricts governance/admin overrides to owner and guards duplicate active membership", () => {
    expect(sql).toContain("Only family owner can modify admin or governance permission overrides");
    expect(sql).toContain("ORDER BY id\n    FOR UPDATE");
  });
});
