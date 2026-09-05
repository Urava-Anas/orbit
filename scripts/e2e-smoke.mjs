import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

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

  console.log("Orbit E2E smoke passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => child.kill("SIGKILL")),
  ]);
}
