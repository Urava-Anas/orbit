"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(128);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function messagePath(path: string, type: "error" | "notice", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${type}=${encodeURIComponent(message)}`;
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new Error("Request host is unavailable.");

  return `${protocol}://${host}`;
}

export async function login(formData: FormData) {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({
      email: value(formData, "email"),
      password: value(formData, "password"),
    });

  if (!parsed.success) {
    redirect(messagePath("/login", "error", "Use a valid email and 12+ character password."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect(messagePath("/login", "error", "Email or password is incorrect."));
  }

  const context = await getOrbitAccess();
  if (!context) {
    redirect(messagePath("/login", "error", "Sign-in session could not be verified."));
  }
  redirect(orbitHomePath(context.access));
}

export async function signInWithGoogle() {
  const origin = await requestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    console.error("Orbit Google sign-in failed", {
      code: error?.code,
      status: error?.status,
    });

    redirect(
      messagePath(
        "/login",
        "error",
        "Google sign-in is unavailable right now. Use email or try again.",
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

  const origin = await requestOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect(
    messagePath(
      "/forgot-password",
      "notice",
      "If that account exists, a secure reset link is on its way.",
    ),
  );
}

export async function updatePassword(formData: FormData) {
  const password = passwordSchema.safeParse(value(formData, "password"));

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
  const { error } = await supabase.auth.updateUser({
    password: password.data,
  });

  if (error) {
    redirect(
      messagePath(
        "/reset-password",
        "error",
        "The reset link expired. Request a new one.",
      ),
    );
  }

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
  redirect(
    messagePath(
      "/login",
      "notice",
      "All Orbit sessions have been securely signed out.",
    ),
  );
}
