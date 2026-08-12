import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type OAuthProvider = "github" | "vercel";

export type IntegrationState = {
  v: 1;
  workspaceId: string;
  userId: string;
  provider: OAuthProvider;
  issuedAt: number;
  nonce: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function integrationSecret() {
  const value = process.env.INTEGRATION_SECRET ?? process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!value || value.length < 24) {
    throw new Error("Orbit integration secret is not configured.");
  }
  return value;
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function fromB64url(value: string) {
  return Buffer.from(value, "base64url");
}

export function issueIntegrationState(input: Omit<IntegrationState, "v" | "issuedAt" | "nonce">) {
  const payload: IntegrationState = {
    v: 1,
    ...input,
    issuedAt: Date.now(),
    nonce: randomBytes(18).toString("base64url"),
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", integrationSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyIntegrationState(token: string, expectedProvider: OAuthProvider) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid integration state.");

  const expected = createHmac("sha256", integrationSecret()).update(encoded).digest();
  const supplied = fromB64url(signature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Integration state signature is invalid.");
  }

  const payload = JSON.parse(fromB64url(encoded).toString("utf8")) as IntegrationState;
  if (
    payload.v !== 1 ||
    payload.provider !== expectedProvider ||
    !payload.workspaceId ||
    !payload.userId ||
    !payload.issuedAt ||
    Date.now() - payload.issuedAt > STATE_TTL_MS ||
    payload.issuedAt - Date.now() > 60_000
  ) {
    throw new Error("Integration state is invalid or expired.");
  }

  return payload;
}

function encryptionKey() {
  return createHash("sha256").update(integrationSecret()).digest();
}

export function encryptIntegrationSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptIntegrationSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    throw new Error("Unsupported encrypted integration secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function orbitBaseUrl() {
  return (
    process.env.FOUNDRY_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://orbit-two-delta.vercel.app"
  ).replace(/\/$/, "");
}

export function githubAppReady() {
  return Boolean(
    process.env.GITHUB_APP_SLUG &&
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_CLIENT_ID &&
      process.env.GITHUB_APP_CLIENT_SECRET &&
      process.env.GITHUB_APP_PRIVATE_KEY,
  );
}

export function vercelIntegrationReady() {
  return Boolean(
    process.env.VERCEL_INTEGRATION_SLUG &&
      process.env.VERCEL_CLIENT_ID &&
      process.env.VERCEL_CLIENT_SECRET,
  );
}

export function githubInstallUrl(state: string) {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) throw new Error("GitHub App slug is not configured.");
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function vercelInstallUrl(state: string) {
  const slug = process.env.VERCEL_INTEGRATION_SLUG;
  if (!slug) throw new Error("Vercel Integration slug is not configured.");
  const url = new URL(`https://vercel.com/integrations/${slug}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubCallbackUrl() {
  return process.env.GITHUB_APP_CALLBACK_URL ?? `${orbitBaseUrl()}/api/integrations/github/callback`;
}

export function vercelCallbackUrl() {
  return process.env.VERCEL_REDIRECT_URI ?? `${orbitBaseUrl()}/api/integrations/vercel/callback`;
}

function normalizePrivateKey(value: string) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function createGitHubAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) throw new Error("GitHub App credentials are not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKey)).toString("base64url");
  return `${data}.${signature}`;
}
