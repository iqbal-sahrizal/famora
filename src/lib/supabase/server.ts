import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export async function createSupabaseServerClient() {
  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError(
      "Supabase environment variables are not configured.",
      { code: "INTERNAL_ERROR", statusCode: 500 }
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where setting cookies is a no-op;
          // middleware handles session refresh.
        }
      },
    },
  });
}
