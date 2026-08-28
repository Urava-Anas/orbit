"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { orbitBaseUrl } from "@/lib/integration-connections";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(128);
const safeAuthPaths = new Set(["/trial", "/account/delete"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeAuthNext(next: string) {
  return safeAuthPaths.has(next) ? next : null;
}

function loginPath(next: string | null) {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

function messagePath(path: string, type: "error" | "notice", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${type}=${encodeURIComponent(message)}`;
}

async function requestOrigin() {
  if (process.env.NODE_ENV === "production") return orbitBaseUrl();

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return orbitBaseUrl();
  return `${protocol}://${host}`;
}

async function requestSubject(email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  return `${email.toLowerCase()}:${forwarded || realIp || "unknown"}`;
}

export async function login(formData: FormData) {
  const next = safeAuthNext(value(formData, "next"));
  const returnToLogin = loginPath(next);
  const parsed = z.object({ email: emailSchema, password: passwordSchema }).safeParse({
    email: value(formData, "email"),
    password: value(formData, "password"),
  });

  if (!parsed.success) {
    redirect(messagePath(returnToLogin, "error", "Use a valid email and 12+ character password."));
  }

  const quota = await consumeRateLimit({
    scope: "auth.login",
    subject: await requestSubject(parsed.data.email),
    limit: 10,
    windowSeconds: 600,
  });
  if (!quota.allowed) {
    redirect(messagePath(returnToLogin, "error", "Too many sign-in attempts. Try again later."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(messagePath(returnToLogin, "error", "Email or password is incorrect."));

  const context = await getOrbitAccess();
  if (!context) redirect(messagePath(returnToLogin, "error", "Sign-in session could not be verified."));
  if (next) redirect(next);
  redirect(orbitHomePath(context.access));
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeAuthNext(value(formData, "next"));
  const returnToLogin = loginPath(next);
  const requestHeaders = await headers();
  const subject = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const quota = await consumeRateLimit({
    scope: "auth.google.start",
    subject,
    limit: 20,
    windowSeconds: 600,
  });
  if (!quota.allowed) redirect(messagePath(returnToLogin, "error", "Too many sign-in attempts. Try again later."));

  const origin = await requestOrigin();
  const callback = new URL("/auth/callback", origin);
  if (next) callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    console.error("Orbit Google sign-in failed", { code: error?.code, status: error?.status });
    redirect(messagePath(returnToLogin, "error", "Google sign-in is unavailable right now. Use email or try again."));
  }
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = emailSchema.safeParse(value(formData, "email"));
  if (!email.success) redirect(messagePath("/forgot-password", "error", "Enter a valid email."));

  const quota = await consumeRateLimit({
    scope: "auth.password_reset",
    subject: await requestSubject(email.data),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!quota.allowed) {
    redirect(messagePath("/forgot-password", "notice", "If that account exists, a secure reset link is on its way."));
  }

  const origin = await requestOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect(messagePath("/forgot-password", "notice", "If that account exists, a secure reset link is on its way."));
}

export async function updatePassword(formData: FormData) {
  const password = passwordSchema.safeParse(value(formData, "password"));
  if (!password.success) {
    redirect(messagePath("/reset-password", "error", "Use a password with at least 12 characters."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect(messagePath("/reset-password", "error", "The reset link expired. Request a new one."));

  await supabase.auth.signOut({ scope: "others" });
  redirect(messagePath("/dashboard/settings", "notice", "Password updated."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect(messagePath("/login", "notice", "All Orbit sessions have been securely signed out."));
}