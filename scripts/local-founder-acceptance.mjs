import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !adminKey) throw new Error("Local Supabase environment is incomplete.");
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Refusing non-local Supabase target.");

const workspaceId = "82000000-0000-4000-8000-000000000001";
const email = "ci-founder-session@urava.test";
const ephemeral = randomBytes(24).toString("base64url");
const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = await admin.auth.admin.createUser({
  email,
  password: ephemeral,
  email_confirm: true,
  user_metadata: { full_name: "CI Founder" },
});
if (created.error || !created.data.user) throw created.error ?? new Error("Could not create managed local Founder identity.");
const founderId = created.data.user.id;

const ownerUpdate = await admin.from("workspaces").update({ owner_id: founderId }).eq("id", workspaceId);
if (ownerUpdate.error) throw ownerUpdate.error;
const memberUpsert = await admin.from("workspace_members").upsert(
  { workspace_id: workspaceId, user_id: founderId, role: "owner" },
  { onConflict: "workspace_id,user_id" },
);
if (memberUpsert.error) throw memberUpsert.error;

const jar = new Map();
const auth = createServerClient(url, publicKey, { cookies: {
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)),
} });
const signed = await auth.auth.signInWithPassword({ email, password: ephemeral });
if (signed.error) throw signed.error;
const verified = await auth.auth.getUser();
if (verified.error || verified.data.user?.id !== founderId) throw verified.error ?? new Error("Managed local Founder session verification failed.");
const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
if (!cookie) throw new Error("No local SSR session cookie was emitted.");

const port = 3101;
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
app.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
try {
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${base}/login`, { redirect: "manual" }); if (r.status < 500) { ready = true; break; } } catch {}
    await sleep(250);
  }
  if (!ready) throw new Error(`Next server did not become ready. ${stderr.slice(-1500)}`);
  const runner = spawn(process.execPath, ["scripts/founder-acceptance-runner.mjs"], { env: { ...process.env, ORBIT_ACCEPTANCE_BASE_URL: base, ORBIT_ACCEPTANCE_TARGET_CLASS: "local", ORBIT_ACCEPTANCE_SESSION_COOKIE: cookie, ORBIT_ACCEPTANCE_OUTPUT_DIR: "artifacts/acceptance-local" }, stdio: "inherit" });
  const code = await new Promise((resolve) => runner.once("exit", (value) => resolve(value ?? 1)));
  if (code !== 0) throw new Error(`Founder acceptance failed with exit code ${code}.`);
} finally {
  app.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => app.once("exit", resolve)), sleep(2000).then(() => app.kill("SIGKILL"))]);
}
