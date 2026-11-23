import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/f/", "/onboarding", "/account"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthPage = AUTH_PAGES.some((page) => pathname.startsWith(page));

  // If Supabase env is not yet configured in local preview, fail closed on protected routes
  if (!url || !anonKey) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Always validate user via getUser() rather than trusting unverified cookie payload
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthPage) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/onboarding";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return supabaseResponse;
}
