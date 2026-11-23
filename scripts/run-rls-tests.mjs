import { execFileSync } from "node:child_process";
import path from "node:path";

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) {
  console.error(
    "BLOCKED: TEST_DATABASE_URL is not set. Provide an isolated local/staging PostgreSQL URI (never production)."
  );
  process.exit(2);
}

const sqlFile = path.join(process.cwd(), "supabase/tests/rls_security_audit.sql");
execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
  stdio: "inherit",
});
console.log("PASS: Live PostgreSQL RLS & privilege verification completed.");
