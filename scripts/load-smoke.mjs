import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 3101;
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
      const response = await fetch(`${base}/login`);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Load-test server did not become ready. ${stderr.slice(-2000)}`);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

try {
  await waitForServer();
  const total = Number(process.env.ORBIT_LOAD_REQUESTS ?? 250);
  const concurrency = Number(process.env.ORBIT_LOAD_CONCURRENCY ?? 25);
  const durations = [];
  let failures = 0;
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const started = performance.now();
      try {
        const response = await fetch(`${base}/login`, { cache: "no-store" });
        if (!response.ok) failures += 1;
        await response.arrayBuffer();
      } catch {
        failures += 1;
      } finally {
        durations.push(performance.now() - started);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const p95 = percentile(durations, 0.95);
  const p99 = percentile(durations, 0.99);
  if (failures !== 0) throw new Error(`Scale smoke had ${failures}/${total} failed requests.`);
  if (p95 > 3000) throw new Error(`Scale smoke p95 ${p95.toFixed(0)}ms exceeded 3000ms.`);
  console.log(`Orbit scale smoke passed: ${total} requests, concurrency ${concurrency}, p95 ${p95.toFixed(0)}ms, p99 ${p99.toFixed(0)}ms.`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => child.kill("SIGKILL")),
  ]);
}
