import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockAuth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
};

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-1", full_name: "Maya Rivera" } }),
  upsert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: "user-1", full_name: "Maya Rivera" } }),
  update: vi.fn().mockReturnThis(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: mockAuth,
    from: mockFrom,
  })),
}));

import {
  forgotPasswordAction,
  loginAction,
  logoutAction,
  registerAction,
  resetPasswordAction,
} from "../actions";
import { requireAuthenticatedUser, safeRedirectPath } from "../server";
import { updateSession } from "@/lib/supabase/middleware";

describe("Famora Authentication & Session Guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a new user and redirects to email verification when session is pending", async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "maya@famora.app" }, session: null },
      error: null,
    });

    const res = await registerAction({
      fullName: "Maya Rivera",
      email: "maya@famora.app",
      password: "Password123",
    });

    expect(res.ok).toBe(true);
    expect(res.redirectTo).toBe("/verify-email?email=maya%40famora.app");
  });

  it("logs in with valid credentials and initializes profile", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1", email: "maya@famora.app" }, session: {} },
      error: null,
    });

    const res = await loginAction({
      email: "maya@famora.app",
      password: "Password123",
      redirectTo: "/f/rivera-family",
    });

    expect(res.ok).toBe(true);
    expect(res.redirectTo).toBe("/f/rivera-family");
  });

  it("rejects invalid credentials with a generic safe error message", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await loginAction({
      email: "maya@famora.app",
      password: "wrong",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Invalid email or password.");
  });

  it("sanitizes email verification / post-auth redirect paths against open redirects", () => {
    expect(safeRedirectPath("/f/rivera-family")).toBe("/f/rivera-family");
    expect(safeRedirectPath("https://evil.com")).toBe("/onboarding");
    expect(safeRedirectPath("//evil.com")).toBe("/onboarding");
    expect(safeRedirectPath(undefined)).toBe("/onboarding");
  });

  it("handles forgot password safely and blocks password reset when recovery session is expired", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const forgotRes = await forgotPasswordAction({ email: "maya@famora.app" });
    expect(forgotRes.ok).toBe(true);

    mockAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "JWT expired" },
    });
    const resetExpired = await resetPasswordAction({
      password: "NewPassword123",
      confirmPassword: "NewPassword123",
    });
    expect(resetExpired.ok).toBe(false);
    expect(resetExpired.error).toContain("expired");

    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockAuth.updateUser.mockResolvedValue({ error: null });
    const resetValid = await resetPasswordAction({
      password: "NewPassword123",
      confirmPassword: "NewPassword123",
    });
    expect(resetValid.ok).toBe(true);
  });

  it("handles session expiration by redirecting unauthenticated requests in requireAuthenticatedUser", async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Session expired" },
    });

    await expect(requireAuthenticatedUser("/account")).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Faccount"
    );
  });

  it("logs out cleanly and redirects to /login", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    const res = await logoutAction();
    expect(res.ok).toBe(true);
    expect(res.redirectTo).toBe("/login");
  });

  it("blocks unauthenticated access to protected routes in middleware", async () => {
    const req = new NextRequest("http://localhost:3000/f/rivera-family");
    const response = await updateSession(req);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?redirectTo=%2Ff%2Frivera-family");
  });
});
