import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 5_000;

export type PasswordExposureResult = "safe" | "leaked" | "unavailable";

export async function checkPasswordExposure(
  password: string,
): Promise<PasswordExposureResult> {
  const hash = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      cache: "no-store",
      headers: {
        "Add-Padding": "true",
        "User-Agent": "Orbit-Auth-Security",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return "unavailable";

    const matches = (await response.text()).split(/\r?\n/);
    const leaked = matches.some((line) => {
      const [candidateSuffix, count] = line.split(":", 2);
      return candidateSuffix === suffix && Number(count) > 0;
    });

    return leaked ? "leaked" : "safe";
  } catch {
    return "unavailable";
  }
}
