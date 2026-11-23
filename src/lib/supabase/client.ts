import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export function createSupabaseBrowserClient() {
  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError(
      "Supabase environment variables are not configured.",
      { code: "INTERNAL_ERROR", statusCode: 500 }
    );
  }

  return createBrowserClient(url, anonKey);
}
