"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import {
  isInvitationReturnPath,
  safeAuthReturnPath,
} from "@/lib/auth-return-path";
import { orbitBaseUrl } from "@/lib/integration-connections";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(128);
const fullNameSchema = z.string().trim().min(2).max(100);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function signupPath(next: string | null) {
  return next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
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

export async function signUp(formData: FormData) {
  const next = safeAuthReturnPath(value(formData, "next"));
  const invitationFlow = isInvitationReturnPath(next);
  const returnToSignup = signupPath(invitationFlow ? next : null);
  const parsed = z
    .object({
      fullName: fullNameSchema,
      email: emailSchema,
      password: passwordSchema,
      confirmPassword: z.string().min(1).max(128),
    })
    .safeParse({
      fullName: value(formData, "full_name"),
      email: value(formData, "email"),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirm_password") ?? ""),
    });

  if (!parsed.success) {
    redirect(
      messagePath(
        returnToSignup,
        "error",
        "Use your name, a valid email, and a password of at least 12 characters.",
      ),
    );
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    redirect(messagePath(returnToSignup, "error", "Passwords do not match."));
  }

  const quota = await consumeRateLimit({
    scope: "auth.signup",
    subject: await requestSubject(parsed.data.email),
    limit: 5,
    windowSeconds: 3600,
  });

  if (!quota.allowed) {
    redirect(
      messagePath(
        returnToSignup,
        "error",
        quota.unavailable
          ? "Account creation is temporarily unavailable. Please try again shortly."
          : "Too many account attempts. Try again later.",
      ),
    );
  }

  const destination = invitationFlow && next ? next : "/onboarding";
  const origin = await requestOrigin();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", destination);

  const metadata = invitationFlow
    ? {
        full_name: parsed.data.fullName,
        orbit_signup_intent: "invitation",
      }
    : {
        full_name: parsed.data.fullName,
        orbit_signup_intent: "founder_trial",
        orbit_onboarding_version: "v1",
      };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callback.toString(),
      data: metadata,
    },
  });

  if (error || !data.user) {
    console.error("Orbit signup failed", { code: error?.code, status: error?.status });
    redirect(
      messagePath(
        returnToSignup,
        "error",
        "Orbit could not create that account. If you already use Orbit, sign in or recover access.",
      ),
    );
  }

  if (data.session) redirect(destination);
  if (invitationFlow && next) {
    redirect(`/verify-email?next=${encodeURIComponent(next)}`);
  }
  redirect("/verify-email");
}

export async function login(formData: FormData) {
  const next = safeAuthReturnPath(value(formData, "next"));
  const returnToLogin = loginPath(next);
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1).max(128) })
    .safeParse({
      email: value(formData, "email"),
      password: String(formData.get("password") ?? ""),
    });

  if (!parsed.success) {
    redirect(messagePath(returnToLogin, "error", "Enter a valid email and your password."));
  }

  const quota = await consumeRateLimit({
    scope: "auth.login",
    subject: await requestSubject(parsed.data.email),
    limit: 10,
    windowSeconds: 600,
  });
  if (!quota.allowed) {
    if (quota.unavailable) {
      redirect(
        messagePath(
          returnToLogin,
          "error",
          "Sign-in is temporarily unavailable. Please try again shortly.",
        ),
      );
    }
    redirect(messagePath(returnToLogin, "error", "Too many sign-in attempts. Try again later."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(messagePath(returnToLogin, "error", "Email or password is incorrect."));

  const context = await getOrbitAccess();
  if (!context) {
    redirect(messagePath(returnToLogin, "error", "Sign-in session could not be verified."));
  }
  if (next) redirect(next);
  redirect(orbitHomePath(context.access));
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeAuthReturnPath(value(formData, "next"));
  const isSignup = value(formData, "flow") === "signup";
  const returnPath = isSignup
    ? signupPath(isInvitationReturnPath(next) ? next : null)
    : loginPath(next);
  const requestHeaders = await headers();
  const subject =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const quota = await consumeRateLimit({
    scope: isSignup ? "auth.google.signup" : "auth.google.start",
    subject,
    limit: 20,
    windowSeconds: 600,
  });
  if (!quota.allowed) {
    redirect(
      messagePath(
        returnPath,
        "error",
        quota.unavailable
          ? "Google authentication is temporarily unavailable. Please try again shortly."
          : "Too many authentication attempts. Try again later.",
      ),
    );
  }

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
    console.error("Orbit Google auth failed", { code: error?.code, status: error?.status });
    redirect(
      messagePath(
        returnPath,
        "error",
        "Google authentication is unavailable right now. Use email or try again.",
      ),
    );
  }
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = emailSchema.safeParse(value(formData, "email"));
  if (!email.success) {
    redirect(messagePath("/forgot-password", "error", "Enter a valid email."));
  }

  const quota = await consumeRateLimit({
    scope: "auth.password_reset",
    subject: await requestSubject(email.data),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!quota.allowed) {
    redirect(
      messagePath(
        "/forgot-password",
        "notice",
        "If this email belongs to an Orbit account, a secure reset link is on its way.",
      ),
    );
  }

  const origin = await requestOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect(
    messagePath(
      "/forgot-password",
      "notice",
      "If this email belongs to an Orbit account, a secure reset link is on its way.",
    ),
  );
}

export async function updatePassword(formData: FormData) {
  const password = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!password.success) {
    redirect(
      messagePath(
        "/reset-password",
        "error",
        "Use a password with at least 12 characters.",
      ),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    redirect(
      messagePath(
        "/reset-password",
        "error",
        "The reset link expired. Request a new one.",
      ),
    );
  }

  await supabase.auth.signOut({ scope: "global" });
  redirect(
    messagePath(
      "/login",
      "notice",
      "Password updated. Sign in again with your new password.",
    ),
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect(
    messagePath(
      "/login",
      "notice",
      "All Orbit sessions have been securely signed out.",
    ),
  );
}
