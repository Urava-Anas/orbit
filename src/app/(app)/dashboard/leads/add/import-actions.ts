"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";

const allowedSources = new Set(["direct", "referral", "website", "whatsapp", "facebook", "instagram", "linkedin", "google", "other"]);
const allowedStages = new Set(["raw", "scored", "contacted", "interested", "demo_booked", "won", "lost"]);
const allowedCurrencies = new Set(["PKR", "USD", "GBP", "EUR", "AED", "SAR"]);

function addRedirect(kind: "error" | "notice", message: string): never {
  redirect(`/dashboard/leads/add?mode=import&${kind}=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/add");
  addRedirect("notice", message);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function first(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const found = record[key]?.trim();
    if (found) return found;
  }
  return "";
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export async function importCsvLeads(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) addRedirect("error", "Choose a CSV file first.");
  if (file.size > 2_000_000) addRedirect("error", "Keep lead imports under 2 MB per file.");
  if (!file.name.toLowerCase().endsWith(".csv")) addRedirect("error", "Orbit currently accepts CSV lead imports on this screen.");

  const rows = parseCsv(await file.text());
  if (rows.length < 2) addRedirect("error", "The CSV needs a header row and at least one lead.");

  const headers = rows[0].map(normalizeHeader);
  const dataRows = rows.slice(1, 501);
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: existingData, error: existingError } = await supabase.from("leads").select("company,email,phone").eq("workspace_id", workspace.id);
  if (existingError) addRedirect("error", "Orbit could not check existing leads before import.");

  const seenCompanies = new Set((existingData ?? []).map((lead) => normalizeText(lead.company)).filter(Boolean));
  const seenEmails = new Set((existingData ?? []).map((lead) => normalizeText(lead.email)).filter(Boolean));
  const seenPhones = new Set((existingData ?? []).map((lead) => normalizeText(lead.phone)).filter(Boolean));
  const payload: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const cells of dataRows) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) record[header] = cells[index] ?? ""; });
    const businessName = clip(first(record, ["business_name", "business", "company", "lead", "name"]), 160);
    if (businessName.length < 2) { skipped += 1; continue; }

    const ownerName = clip(first(record, ["owner_name", "owner", "contact_name", "contact"]), 120);
    const email = clip(first(record, ["email", "email_address"]), 254);
    const phone = clip(first(record, ["phone", "phone_number", "mobile"]), 40);
    const whatsapp = clip(first(record, ["whatsapp", "whatsapp_number"]), 40);
    const companyKey = normalizeText(businessName);
    const emailKey = normalizeText(email);
    const phoneKey = normalizeText(phone);

    if (seenCompanies.has(companyKey) || (emailKey && seenEmails.has(emailKey)) || (phoneKey && seenPhones.has(phoneKey))) {
      skipped += 1;
      continue;
    }

    const rawSource = normalizeText(first(record, ["source", "lead_source"])).replace(/\s+/g, "_");
    const source = allowedSources.has(rawSource) ? rawSource : "other";
    const rawStage = normalizeText(first(record, ["stage", "status"])).replace(/\s+/g, "_");
    const stage = allowedStages.has(rawStage) ? rawStage : "raw";
    const rawCurrency = first(record, ["currency"]).toUpperCase();
    const currency = allowedCurrencies.has(rawCurrency) ? rawCurrency : "PKR";
    const scoreText = first(record, ["lead_score", "score"]);
    const leadScore = scoreText ? Math.round(boundedNumber(scoreText, 0, 100, 0)) : null;

    payload.push({
      workspace_id: workspace.id,
      name: ownerName || businessName,
      company: businessName,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || phone || null,
      source,
      stage,
      niche: clip(first(record, ["niche", "industry", "category"]), 100) || null,
      lead_score: leadScore,
      estimated_value: boundedNumber(first(record, ["estimated_value", "value", "deal_value"]), 0, 999999999999, 0),
      currency,
      pain_point: clip(first(record, ["pain_point", "pain", "problem"]), 4000) || null,
      next_action: clip(first(record, ["next_action", "next_step"]), 240) || null,
      google_maps_url: clip(first(record, ["google_maps_url", "source_link", "url"]), 500) || null,
      notes: clip(first(record, ["notes", "note"]), 4000) || null,
      owner_id: user.id,
      created_by: user.id,
      imported_at: new Date().toISOString(),
    });

    seenCompanies.add(companyKey);
    if (emailKey) seenEmails.add(emailKey);
    if (phoneKey) seenPhones.add(phoneKey);
  }

  if (!payload.length) addRedirect("error", `No new leads were importable. ${skipped} rows were invalid or duplicates.`);
  const { error } = await supabase.from("leads").insert(payload);
  if (error) addRedirect("error", "Orbit could not import this CSV. Check the columns and values.");
  done(`${payload.length} leads imported. ${skipped} invalid or duplicate rows skipped.`);
}
