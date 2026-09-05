const STATIC_AUTH_RETURN_PATHS = new Set([
  "/trial",
  "/onboarding",
  "/reset-password",
]);

const INVITATION_RETURN_PATH = /^\/invite\/[A-Za-z0-9_-]{32,128}$/;

export function safeAuthReturnPath(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (STATIC_AUTH_RETURN_PATHS.has(candidate)) return candidate;
  if (INVITATION_RETURN_PATH.test(candidate)) return candidate;
  return null;
}

export function isInvitationReturnPath(value: string | null | undefined) {
  const candidate = value?.trim();
  return Boolean(candidate && INVITATION_RETURN_PATH.test(candidate));
}
