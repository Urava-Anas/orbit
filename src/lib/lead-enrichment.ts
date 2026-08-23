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

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function normalizeWebsite(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
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

function extractEmail(text: string) {
  return clean(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
}

function extractPhone(text: string) {
  const values = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  return clean(values.find((value) => value.replace(/\D/g, "").length >= 10));
}

function extractContact(text: string) {
  const roles = ["owner", "co-owner", "founder", "co-founder", "president", "chief executive officer", "ceo", "managing director", "general manager", "manager", "director"];
  for (const role of roles) {
    const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})\\s*[-–—,:|]+\\s*${escaped}\\b`, "i"),
      new RegExp(`\\b${escaped}\\s*[-–—,:|]+\\s*([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})`, "i"),
      new RegExp(`([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){1,3})[^.]{0,45}\\b(?:is|serves as|acts as|,)?\\s*(?:the\\s+)?${escaped}\\b`, "i"),
    ];
    for (const pattern of patterns) {
      const person = clean(text.match(pattern)?.[1]);
      if (person && person.length <= 80) return { person, role };
    }
  }
  return { person: null, role: null };
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "OrbitLeadEnrichment/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
  const html = (await response.text()).slice(0, 500_000);
  return { html, text: stripHtml(html), finalUrl: response.url };
}

function candidateLinks(html: string, base: URL) {
  const links = new Set<string>();
  const regex = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], base);
      if (url.hostname !== base.hostname) continue;
      if (/\b(about|team|staff|contact|company|leadership|our-story|who-we-are)\b/i.test(url.pathname)) links.add(url.toString());
    } catch {
      // malformed link
    }
  }
  return [...links].slice(0, 4);
}

export async function enrichPublicBusinessContact(input: {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<EnrichmentResult> {
  const website = normalizeWebsite(input.website);
  let phone = clean(input.phone);
  let email = clean(input.email);
  let contactPerson: string | null = null;
  let contactRole: string | null = null;
  const sources = new Set<string>();

  if (phone || email || website) sources.add("geoapify");

  if (website) {
    try {
      const home = await fetchPage(website);
      if (home) {
        sources.add("public_website");
        phone ||= extractPhone(home.text);
        email ||= extractEmail(home.text);
        ({ person: contactPerson, role: contactRole } = extractContact(home.text));

        if (!contactPerson) {
          const base = new URL(home.finalUrl || website);
          for (const link of candidateLinks(home.html, base)) {
            try {
              const page = await fetchPage(link);
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
              // best effort
            }
          }
        }
      }
    } catch {
      // provider data remains valid when site enrichment fails
    }
  }

  const channels = [phone, email, website].filter(Boolean).length;
  const confidence = Math.min(100, channels * 20 + (contactPerson ? 30 : 0) + (contactRole ? 10 : 0));
  const status: EnrichmentResult["status"] = contactPerson && channels >= 2 ? "enriched" : channels > 0 ? "partial" : "unresolved";

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
