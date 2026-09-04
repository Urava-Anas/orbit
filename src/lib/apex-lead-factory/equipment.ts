import "server-only";

import type { ObservedCarrierVehicle } from "@/lib/apex-lead-factory/contracts";

const TRANSPORTATION_DATA_ORIGIN = "https://data.transportation.gov";
const VEHICLE_INSPECTION_DATASET_ID = "fx4q-ay7w";
const INSPECTIONS_PER_UNIT_DATASET_ID = "wt8s-2hbx";
const VPIC_ORIGIN = "https://vpic.nhtsa.dot.gov";
const TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8_000_000;
const MAX_INSPECTIONS_PER_CARRIER = 12;
const MAX_VINS_PER_CARRIER = 12;

interface InspectionHeaderRow {
  inspection_id?: string;
  dot_number?: string;
  insp_date?: string;
}

interface InspectionUnitRow {
  inspection_id?: string;
  insp_unit_id?: string | number;
  insp_unit_type_id?: string;
  insp_unit_make?: string;
  insp_unit_company?: string;
  insp_unit_license?: string;
  insp_unit_license_state?: string;
  insp_unit_vehicle_id_number?: string;
}

interface VpicFlatRow {
  VIN?: string;
  Make?: string;
  Model?: string;
  ModelYear?: string;
  BodyClass?: string;
  VehicleType?: string;
  ErrorCode?: string;
  ErrorText?: string;
}

interface VpicResponse {
  Results?: VpicFlatRow[];
}

export interface CarrierObservedEquipmentResult {
  usdotNumber: string;
  observations: ObservedCarrierVehicle[];
  inspectionCountUsed: number;
  vinDecodeCount: number;
}

function normalizeUsdot(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function unitTypeDescription(typeId?: string): string | null {
  // Public MCMIS inspection-unit codes used for the equipment classes Apex
  // actually needs to distinguish. Unknown codes remain explicit instead of
  // being guessed into a truck category.
  switch (typeId) {
    case "2":
      return "Converter Dolly";
    case "3":
      return "Full Trailer";
    case "7":
      return "Pole Trailer";
    case "9":
      return "Semi Trailer";
    case "10":
      return "Straight Truck";
    case "11":
      return "Truck Tractor";
    case "12":
      return "Van";
    case "14":
      return "Intermodal Chassis";
    default:
      return typeId ? `Inspection unit type ${typeId}` : null;
  }
}

async function fetchJsonArray<T>(url: URL): Promise<T[]> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Public FMCSA equipment source failed: ${message}`);
  }

  if (!response.ok) throw new Error(`Public FMCSA equipment source returned HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("Public FMCSA equipment response exceeded the safe size limit.");
  }
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("Public FMCSA equipment response exceeded the safe size limit.");
  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload)) throw new Error("Public FMCSA equipment source returned an invalid response shape.");
  return payload.filter((row): row is T => Boolean(row && typeof row === "object" && !Array.isArray(row)));
}

async function fetchInspectionHeaders(usdots: string[]): Promise<InspectionHeaderRow[]> {
  if (!usdots.length) return [];
  const url = new URL(`/resource/${VEHICLE_INSPECTION_DATASET_ID}.json`, TRANSPORTATION_DATA_ORIGIN);
  url.searchParams.set("$select", "inspection_id,dot_number,insp_date");
  url.searchParams.set("$where", `dot_number in (${usdots.map(sqlLiteral).join(",")})`);
  url.searchParams.set("$order", "insp_date DESC, inspection_id DESC");
  url.searchParams.set("$limit", String(Math.min(5_000, usdots.length * MAX_INSPECTIONS_PER_CARRIER * 4)));
  return fetchJsonArray<InspectionHeaderRow>(url);
}

async function fetchInspectionUnits(inspectionIds: string[]): Promise<InspectionUnitRow[]> {
  if (!inspectionIds.length) return [];
  const url = new URL(`/resource/${INSPECTIONS_PER_UNIT_DATASET_ID}.json`, TRANSPORTATION_DATA_ORIGIN);
  url.searchParams.set(
    "$select",
    [
      "inspection_id",
      "insp_unit_id",
      "insp_unit_type_id",
      "insp_unit_make",
      "insp_unit_company",
      "insp_unit_license",
      "insp_unit_license_state",
      "insp_unit_vehicle_id_number",
    ].join(","),
  );
  url.searchParams.set("$where", `inspection_id in (${inspectionIds.map(sqlLiteral).join(",")})`);
  url.searchParams.set("$limit", String(Math.min(5_000, Math.max(100, inspectionIds.length * 6))));
  return fetchJsonArray<InspectionUnitRow>(url);
}

function validVin(value: string | null): value is string {
  return Boolean(value && /^[A-HJ-NPR-Z0-9]{17}$/i.test(value));
}

async function decodeVinBatch(vins: string[]): Promise<Map<string, VpicFlatRow>> {
  const unique = [...new Set(vins.map((vin) => vin.toUpperCase()))];
  const decoded = new Map<string, VpicFlatRow>();

  for (let offset = 0; offset < unique.length; offset += 50) {
    const chunk = unique.slice(offset, offset + 50);
    const body = new URLSearchParams({
      format: "json",
      data: `${chunk.join(";")};`,
    });

    let response: Response;
    try {
      response = await fetch(`${VPIC_ORIGIN}/api/vehicles/DecodeVINValuesBatch/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Equipment evidence remains useful without a decoded VIN. vPIC is an
      // enrichment source, not a required identity source.
      continue;
    }

    if (!response.ok) continue;
    const payload = (await response.json()) as VpicResponse;
    for (const row of payload.Results ?? []) {
      const vin = cleanText(row.VIN)?.toUpperCase();
      if (!vin) continue;
      decoded.set(vin, row);
    }
  }

  return decoded;
}

/**
 * Inspection-derived vehicle evidence for a small worker chunk. These records
 * prove equipment was observed under the carrier at inspection time; they are
 * never represented as the carrier's complete current fleet.
 */
export async function fetchObservedEquipmentForCarriers(
  usdotNumbers: string[],
  retrievedAt = new Date().toISOString(),
): Promise<CarrierObservedEquipmentResult[]> {
  const usdots = [...new Set(usdotNumbers.map(normalizeUsdot).filter(Boolean))].slice(0, 50);
  if (!usdots.length) return [];

  const headers = await fetchInspectionHeaders(usdots);
  const inspectionToDot = new Map<string, { dot: string; date: string | null }>();
  const selectedInspectionIds: string[] = [];
  const countByDot = new Map<string, number>();

  for (const row of headers) {
    const inspectionId = cleanText(row.inspection_id);
    const dot = normalizeUsdot(cleanText(row.dot_number) ?? "");
    if (!inspectionId || !dot || !usdots.includes(dot)) continue;
    const count = countByDot.get(dot) ?? 0;
    if (count >= MAX_INSPECTIONS_PER_CARRIER) continue;
    countByDot.set(dot, count + 1);
    inspectionToDot.set(inspectionId, { dot, date: cleanText(row.insp_date) });
    selectedInspectionIds.push(inspectionId);
  }

  const units = await fetchInspectionUnits(selectedInspectionIds);
  const unitsByDot = new Map<string, Array<{ row: InspectionUnitRow; date: string | null }>>();
  for (const row of units) {
    const inspectionId = cleanText(row.inspection_id);
    const header = inspectionId ? inspectionToDot.get(inspectionId) : undefined;
    if (!header) continue;
    const existing = unitsByDot.get(header.dot) ?? [];
    existing.push({ row, date: header.date });
    unitsByDot.set(header.dot, existing);
  }

  const vinsToDecode: string[] = [];
  for (const dot of usdots) {
    const carrierUnits = unitsByDot.get(dot) ?? [];
    let count = 0;
    for (const { row } of carrierUnits) {
      const vin = cleanText(row.insp_unit_vehicle_id_number)?.toUpperCase() ?? null;
      if (validVin(vin) && count < MAX_VINS_PER_CARRIER) {
        vinsToDecode.push(vin);
        count += 1;
      }
    }
  }
  const decodedVins = await decodeVinBatch(vinsToDecode);

  return usdots.map((dot) => {
    const carrierUnits = unitsByDot.get(dot) ?? [];
    const seen = new Set<string>();
    const observations: ObservedCarrierVehicle[] = [];
    let decodedCount = 0;

    for (const { row, date } of carrierUnits) {
      const vin = cleanText(row.insp_unit_vehicle_id_number)?.toUpperCase() ?? null;
      const unitId = cleanText(String(row.insp_unit_id ?? ""));
      const key = vin || `${row.inspection_id ?? ""}:${unitId ?? ""}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const decoded = validVin(vin) ? decodedVins.get(vin) : undefined;
      if (decoded) decodedCount += 1;
      const decodedYear = Number(decoded?.ModelYear ?? "");

      observations.push({
        vin,
        vehicleType: cleanText(decoded?.VehicleType) ?? unitTypeDescription(cleanText(row.insp_unit_type_id) ?? undefined),
        make: cleanText(decoded?.Make) ?? cleanText(row.insp_unit_make),
        model: cleanText(decoded?.Model),
        modelYear: Number.isInteger(decodedYear) && decodedYear >= 1900 && decodedYear <= 2100 ? decodedYear : null,
        bodyClass: cleanText(decoded?.BodyClass) ?? unitTypeDescription(cleanText(row.insp_unit_type_id) ?? undefined),
        plateState: cleanText(row.insp_unit_license_state),
        sourceName: decoded ? "FMCSA Inspection Files + NHTSA vPIC" : "FMCSA Inspections Per Unit",
        sourceReference: cleanText(row.inspection_id) ? `Inspection ${row.inspection_id}` : null,
        observedAt: date,
        retrievedAt,
        confidence: decoded ? 95 : 90,
      });
    }

    return {
      usdotNumber: dot,
      observations,
      inspectionCountUsed: countByDot.get(dot) ?? 0,
      vinDecodeCount: decodedCount,
    };
  });
}
