type EnrichmentResult = {
  contactPerson: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: "enriched" | "partial" | "unresolved";
  confidence: number;
  source: string;
};

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function normalizeWebsite(value: string | null | undefined) {
  const website = cleanText(value);
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sameOrigin(base: URL, candidate: URL) {
  return base.protocol === candidate.protocol && base.hostname === candidate.hostname;
}

function extractLinks(html: string, base: URL) {
  const links = new Set<string>();
  const regex = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], base);
      if (!sameOrigin(base, url)) continue;
      const path = url.pathname.toLowerCase();
      if (/\b(about|team|staff|contact|company|leadership|our-story|who-we-are)\b/.test(path)) links.add(url.toString());
    } catch {
      // ignore malformed links
    }
  }
  return [...links].slice(0, 4);
}

function extractEmail(text: string) {
  return cleanText(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
}

function extractPhone(text: string) {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  return cleanText(candidates.find((value) => value.replace(/\D/g, "").length >= 10));
}

function extractContact(text: string) {
  const rolePatterns = [
    "owner",
    "co-owner",
    "founder",
    "co-founder",
    "president",
    "chief executive officer",
    "ceo",
    "managing director",
    "general manager",
    "manager",
    "director",
  ];
  for (const role of rolePatterns) {
    const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = new RegExp(`([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})\\s*[-–—,:|]+\\s*${escaped}\\b`, "i");
    const after = new RegExp(`\\b${escaped}\\s*[-–—,:|]+\\s*([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})`, "i");
    const sentence = new RegExp(`([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})[^.]{0,40}\\b(?:is|serves as|acts as|,)?\\s*(?:the\\s+)?${escaped}\\b`, "i");
    const match = text.match(before) ?? text.match(after) ?? text.match(sentence);
    const person = cleanText(match?.[1]);
    if (person && person.length <= 80) return { person, role };
  }
  return { person: null, role: null };
}

async function fetchPublicPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "OrbitLeadEnrichment/1.0 (+https://orbit.urava.ai)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;
  const html = (await response.text()).slice(0, 500_000);
  return { html, text: stripHtml(html), finalUrl: response.url };
}

export async function enrichPublicBusinessContact(input: {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<EnrichmentResult> {
  const website = normalizeWebsite(input.website);
  let phone = cleanText(input.phone);
  let email = cleanText(input.email);
  let contactPerson: string | null = null;
  let contactRole: string | null = null;
  const sources = new Set<string>();

  if (phone || email || website) sources.add("geoapify");

  if (website) {
    try {
      const home = await fetchPublicPage(website);
      if (home) {
        sources.add("public_website");
        phone ||= extractPhone(home.text);
        email ||= extractEmail(home.text);
        ({ person: contactPerson, role: contactRole } = extractContact(home.text));

        if (!contactPerson) {
          const base = new URL(home.finalUrl || website);
          for (const link of extractLinks(home.html, base)) {
            try {
              const page = await fetchPublicPage(link);
              if (!page) continue;
              phone ||= extractPhone(page.text);
              email ||= extractEmail(page.text);
              const contact = extractContact(page.text);
              if (contact.person) {
                contactPerson = contact.person;
                contactRole = contact.role;
                break;
              }
            } catch {
              // keep best-effort enrichment non-blocking
            }
          }
        }
      }
    } catch {
      // provider data is still useful when the public site cannot be reached
    }
  }

  const contactChannels = [phone, email, website].filter(Boolean).length;
  const confidence = Math.min(100, contactChannels * 20 + (contactPerson ? 30 : 0) + (contactRole ? 10 : 0));
  const status = contactPerson && contactChannels >= 2 ? "enriched" : contactChannels > 0 ? "partial" : "unresolved";

  return {
    contactPerson,
    contactRole,
    phone,
    email,
    website,
    status,
    confidence,
    source: [...sources].join("+") || "none",
  };
}
