import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupOneOptions } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_PINNED_RESPONSE_BYTES = 2 * 1024 * 1024 + 64 * 1024;

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return true;
  return (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:db8::")
  );
}

function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function resolvePinnedAddress(hostname: string) {
  if (isIP(hostname)) throw new Error("Direct-IP plugin endpoints are not allowed.");
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Plugin endpoint resolved to a private or reserved network.");
  }
  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error("Plugin endpoint did not resolve to a supported address.");
  }
  return { address: selected.address, family: selected.family as 4 | 6 };
}

function responseHeaders(rawHeaders: Record<string, string | string[] | undefined>) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (typeof value === "string") headers.set(name, value);
  }
  return headers;
}

/**
 * Minimal fetch-compatible HTTPS client for the plugin runtime.
 * DNS is resolved once, validated, then that exact public address is pinned for the TLS connection.
 * TLS SNI/certificate verification and the HTTP Host header still use the reviewed hostname.
 */
export async function pinnedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const endpoint = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new Error("Plugin endpoint must use credential-free HTTPS.");
  }
  if (endpoint.port && endpoint.port !== "443") throw new Error("Plugin endpoint must use HTTPS port 443.");
  const hostname = endpoint.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local plugin endpoints are not allowed.");
  }
  const pinned = await resolvePinnedAddress(hostname);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, key) => { requestHeaders[key] = value; });
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const body = typeof init?.body === "string" || Buffer.isBuffer(init?.body) ? init.body : undefined;

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const options = {
      protocol: "https:",
      hostname,
      servername: hostname,
      port: 443,
      method,
      path: `${endpoint.pathname}${endpoint.search}`,
      headers: requestHeaders,
      rejectUnauthorized: true,
      lookup: (
        _hostname: string,
        _options: LookupOneOptions,
        callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
      ) => callback(null, pinned.address, pinned.family),
    };

    const req = httpsRequest(options, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > MAX_PINNED_RESPONSE_BYTES) {
          res.destroy(new Error("Plugin endpoint response exceeded Orbit's size limit."));
          return;
        }
        chunks.push(buffer);
      });
      res.on("error", fail);
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(new Response(Buffer.concat(chunks), {
          status: res.statusCode ?? 502,
          statusText: res.statusMessage,
          headers: responseHeaders(res.headers),
        }));
      });
    });

    req.on("error", fail);
    const onAbort = () => req.destroy(new DOMException("The operation was aborted.", "AbortError"));
    if (init?.signal) {
      if (init.signal.aborted) return onAbort();
      init.signal.addEventListener("abort", onAbort, { once: true });
      req.once("close", () => init.signal?.removeEventListener("abort", onAbort));
    }
    if (body !== undefined) req.write(body);
    req.end();
  });
}
