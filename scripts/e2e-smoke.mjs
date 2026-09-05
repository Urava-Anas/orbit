import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const port = 3100;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Next server did not become ready. ${stderr.slice(-2000)}`);
}

function assertRedirect(response, path, destinationPrefix) {
  if (![307, 308].includes(response.status)) {
    throw new Error(`${path} returned ${response.status}; expected redirect`);
  }
  const location = response.headers.get("location") ?? "";
  const resolved = new URL(location, base);
  if (!`${resolved.pathname}${resolved.search}`.startsWith(destinationPrefix)) {
    throw new Error(`${path} redirected to ${resolved.pathname}${resolved.search}; expected ${destinationPrefix}`);
  }
}

async function verifyFounderAuthStateMachine() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("Isolated Supabase environment is required for auth-product smoke.");
  }

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `orbit-access-${unique}@example.test`;
  const password = `Ci-only-${unique}-Secure!`;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId = null;
  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Orbit Access CI",
        orbit_signup_intent: "founder_trial",
        orbit_onboarding_version: "v1",
      },
    });
    if (createError || !created.user) {
      throw new Error(`Could not create isolated auth user: ${createError?.message ?? "unknown"}`);
    }
    userId = created.user.id;

    const { error: signInError } = await browser.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`Isolated sign-in failed: ${signInError.message}`);

    const { data: pendingData, error: pendingError } = await browser.rpc("claim_orbit_access");
    if (pendingError) throw new Error(`Pending access resolution failed: ${pendingError.message}`);
    const pending = Array.isArray(pendingData) ? pendingData[0] : pendingData;
    if (pending?.account_role !== "pending" || pending?.workspace_id) {
      throw new Error("Fresh verified Orbit identity was not pending before onboarding.");
    }

    const { data: trialData, error: trialError } = await browser.rpc("start_orbit_trial", {
      workspace_name: "Orbit Access CI Company",
    });
    if (trialError) throw new Error(`Trial activation failed: ${trialError.message}`);
    const trial = Array.isArray(trialData) ? trialData[0] : trialData;
    if (!trial?.workspace_id || !trial?.trial_ends_at) {
      throw new Error("Trial activation did not return workspace and expiry.");
    }

    const { data: founderData, error: founderError } = await browser.rpc("claim_orbit_access");
    if (founderError) throw new Error(`Founder access resolution failed: ${founderError.message}`);
    const founder = Array.isArray(founderData) ? founderData[0] : founderData;
    if (founder?.account_role !== "founder" || founder?.workspace_id !== trial.workspace_id) {
      throw new Error("Trial activation did not transition the identity to founder access.");
    }

    const { error: duplicateTrialError } = await browser.rpc("start_orbit_trial", {
      workspace_name: "Duplicate Orbit Access CI Company",
    });
    if (!duplicateTrialError) {
      throw new Error("Duplicate founder trial creation was not rejected.");
    }
  } finally {
    await browser.auth.signOut();
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

try {
  await waitForServer();
  const checks = [
    ["/login", [200]],
    ["/signup", [200]],
    ["/verify-email", [200]],
    ["/forgot-password", [200]],
    ["/orbit/privacy", [200]],
    ["/account/delete", [200]],
    ["/api/health/production", [200]],
    ["/dashboard", [307, 308]],
  ];
  for (const [path, expected] of checks) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    if (!expected.includes(response.status)) {
      throw new Error(`${path} returned ${response.status}; expected ${expected.join("/")}`);
    }
    const csp = response.headers.get("content-security-policy") ?? "";
    if (!csp.includes("nonce-") || csp.includes("script-src 'self' 'unsafe-inline'")) {
      throw new Error(`${path} did not receive the hardened nonce CSP.`);
    }
  }

  const trialResponse = await fetch(`${base}/trial`, { redirect: "manual" });
  assertRedirect(trialResponse, "/trial", "/signup");

  const onboardingResponse = await fetch(`${base}/onboarding`, { redirect: "manual" });
  assertRedirect(onboardingResponse, "/onboarding", "/signup");

  const resetResponse = await fetch(`${base}/reset-password`, { redirect: "manual" });
  assertRedirect(resetResponse, "/reset-password", "/forgot-password");

  const homeResponse = await fetch(base, { redirect: "manual" });
  if (homeResponse.status !== 200) {
    throw new Error(`/ returned ${homeResponse.status}; expected 200`);
  }
  const homeHtml = await homeResponse.text();
  if (!homeHtml.includes('href="/signup"') || homeHtml.includes('href="/login?next=/trial"')) {
    throw new Error("Public trial CTA does not route cleanly to /signup.");
  }

  await verifyFounderAuthStateMachine();
  console.log("Orbit E2E smoke passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => child.kill("SIGKILL")),
  ]);
}
