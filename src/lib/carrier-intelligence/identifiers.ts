export type CarrierIdentifierKind = "dot" | "mc";

export type CarrierLookupIdentifier = {
  kind: CarrierIdentifierKind;
  value: string;
  canonical: string;
};

export type CarrierIdentifierParseResult =
  | { ok: true; identifier: CarrierLookupIdentifier }
  | {
      ok: false;
      reason: "empty" | "ambiguous" | "invalid" | "unsupported";
      message: string;
    };

const MAX_IDENTIFIER_DIGITS = 10;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function validDigits(value: string) {
  return /^\d+$/.test(value) && value.length >= 1 && value.length <= MAX_IDENTIFIER_DIGITS;
}

function build(kind: CarrierIdentifierKind, value: string): CarrierLookupIdentifier {
  return {
    kind,
    value,
    canonical: kind === "dot" ? `USDOT ${value}` : `MC ${value}`,
  };
}

/**
 * Parse dispatcher-entered carrier identifiers without guessing.
 *
 * Accepted examples:
 * - USDOT 1234567
 * - DOT#1234567
 * - MC 123456
 * - MC-123456
 *
 * A bare number is deliberately ambiguous. The UI can resolve that ambiguity
 * by providing `preferredKind` from an explicit MC/USDOT selector. This prevents
 * a numeric MC from being silently treated as a USDOT number or vice versa.
 */
export function parseCarrierLookupIdentifier(
  input: string,
  preferredKind?: CarrierIdentifierKind,
): CarrierIdentifierParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: "empty", message: "Enter an MC or USDOT number." };
  }

  const normalized = raw.toUpperCase().replace(/[\s._#:/]+/g, "-");
  const compact = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");

  const dotMatch = compact.match(/^(?:USDOT|DOT)-?(\d+)$/);
  if (dotMatch) {
    const value = dotMatch[1];
    return validDigits(value)
      ? { ok: true, identifier: build("dot", value) }
      : { ok: false, reason: "invalid", message: "USDOT number is invalid." };
  }

  const mcMatch = compact.match(/^MC-?(\d+)$/);
  if (mcMatch) {
    const value = mcMatch[1];
    return validDigits(value)
      ? { ok: true, identifier: build("mc", value) }
      : { ok: false, reason: "invalid", message: "MC number is invalid." };
  }

  if (/^\d+$/.test(raw)) {
    if (!validDigits(raw)) {
      return { ok: false, reason: "invalid", message: "Carrier identifier is invalid." };
    }
    if (!preferredKind) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Choose MC or USDOT for a number without a prefix.",
      };
    }
    return { ok: true, identifier: build(preferredKind, raw) };
  }

  // A user may paste a formatted identifier containing punctuation. Only accept
  // it when the prefix remains explicit; otherwise punctuation stripping could
  // turn unrelated text into an apparently valid carrier number.
  const explicitPrefix = /^\s*(USDOT|DOT|MC)\b/i.test(raw);
  if (explicitPrefix) {
    const value = digitsOnly(raw);
    if (validDigits(value)) {
      return {
        ok: true,
        identifier: build(/^\s*MC\b/i.test(raw) ? "mc" : "dot", value),
      };
    }
  }

  return {
    ok: false,
    reason: "unsupported",
    message: "Use an MC number or USDOT number for Carrier 360 lookup.",
  };
}
