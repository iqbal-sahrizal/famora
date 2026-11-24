import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockAuth = {
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
};

const mockEnsureProfile = vi.fn();
vi.mock("@/features/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/server")>();
  return {
    ...actual,
    ensureProfileInitialized: (...args: unknown[]) => mockEnsureProfile(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: mockAuth,
  })),
}));

import { resolveAppUrl } from "@/lib/env";
import { forgotPasswordAction, registerAction } from "../actions";
import { GET as authCallbackGet } from "@/app/auth/callback/route";

describe("Famora Production Email Verification & Mobile Redirect", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", origNodeEnv ?? "test");
    if (origAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
  });

  it("never resolves localhost in production even when NEXT_PUBLIC_APP_URL is unset or localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(resolveAppUrl()).toBe("https://famora-eight.vercel.app");
    expect(resolveAppUrl("http://localhost:3000")).toBe("https://famora-eight.vercel.app");
    expect(resolveAppUrl("https://famora-eight.vercel.app")).toBe(
      "https://famora-eight.vercel.app"
    );
  });

  it("sends production emailRedirectTo on signup without localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://famora-eight.vercel.app";
    mockHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-host": "famora-eight.vercel.app", "x-forwarded-proto": "https" })
    );
    mockAuth.signUp.mockResolvedValue({
      data: { user: { id: "u-1", email: "new@famora.app" }, session: null },
      error: null,
    });

    const res = await registerAction({
      fullName: "Nadia Putri",
      email: "new@famora.app",
      password: "Password123",
    });

    expect(res.ok).toBe(true);
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://famora-eight.vercel.app/auth/callback?next=%2Fonboarding",
        }),
      })
    );
    const sentRedirect = mockAuth.signUp.mock.calls[0]?.[0]?.options?.emailRedirectTo;
    expect(sentRedirect).not.toContain("localhost");

    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await forgotPasswordAction({ email: "new@famora.app" });
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith("new@famora.app", {
      redirectTo:
        "https://famora-eight.vercel.app/auth/callback?next=%2Freset-password",
    });
  });

  it("handles PKCE code exchange and redirects to mobile-friendly verified state", async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u-1", email: "new@famora.app" } },
      error: null,
    });

    const req = new Request(
      "https://famora-eight.vercel.app/auth/callback?code=pkce-code-123&next=%2Fonboarding"
    );
    const res = await authCallbackGet(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://famora-eight.vercel.app/verify-email?status=verified&next=%2Fonboarding"
    );
    expect(mockEnsureProfile).toHaveBeenCalledTimes(1);
  });

  it("handles token_hash OTP verification and password recovery redirects", async () => {
    mockAuth.verifyOtp.mockResolvedValue({
      data: { user: { id: "u-1", email: "new@famora.app" } },
      error: null,
    });

    const req = new Request(
      "https://famora-eight.vercel.app/auth/callback?token_hash=hash-abc&type=recovery&next=%2Freset-password"
    );
    const res = await authCallbackGet(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://famora-eight.vercel.app/reset-password"
    );
  });

  it("redirects invalid or expired verification links to /verify-email?status=error without exposing tokens", async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "Token expired" },
    });

    const req = new Request(
      "https://famora-eight.vercel.app/auth/callback?code=expired-secret-code&next=%2Fonboarding"
    );
    const res = await authCallbackGet(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toBe(
      "https://famora-eight.vercel.app/verify-email?status=error&next=%2Fonboarding"
    );
    expect(location).not.toContain("expired-secret-code");
  });
});
