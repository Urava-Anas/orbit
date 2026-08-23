from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path: str, old: str, new: str):
    file = ROOT / path
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))

# Finder pipeline
p = "src/app/(app)/dashboard/leads/finder/actions.ts"
replace(p,
'import { getGeoapifyApiKey } from "@/lib/geoapify";\nimport { requireWorkspace } from "@/lib/workspace";',
'import { getGeoapifyApiKey } from "@/lib/geoapify";\nimport { enrichPublicBusinessContact } from "@/lib/lead-enrichment";\nimport { requireWorkspace } from "@/lib/workspace";')

replace(p,
'''  website: string | null;\n  openingHours: string | null;\n  brand: string | null;\n  lat: number | null;\n  lon: number | null;''',
'''  website: string | null;\n  contactPerson: string | null;\n  contactRole: string | null;\n  enrichmentStatus: "pending" | "enriched" | "partial" | "unresolved";\n  enrichmentConfidence: number | null;\n  enrichmentSource: string | null;\n  openingHours: string | null;\n  brand: string | null;\n  lat: number | null;\n  lon: number | null;''')

replace(p,
'''  google_maps_url: string | null;\n  niche: string;''',
'''  google_maps_url: string | null;\n  phone: string | null;\n  email: string | null;\n  website_url: string | null;\n  niche: string;''')

replace(p,
'''    website: null,\n    openingHours: null,''',
'''    website: null,\n    contactPerson: null,\n    contactRole: null,\n    enrichmentStatus: "pending",\n    enrichmentConfidence: null,\n    enrichmentSource: null,\n    openingHours: null,''')

replace(p,
'''async function enrichCandidates(key: string, candidates: PlaceCandidate[]) {\n  const enriched: PlaceCandidate[] = [];\n  for (let index = 0; index < candidates.length; index += 10) {\n    const batch = candidates.slice(index, index + 10);\n    const values = await Promise.all(batch.map(async (candidate) => {\n      try {\n        return { ...candidate, place: mergeDetails(candidate.place, await placeDetails(key, candidate.place.id)) };\n      } catch {\n        return candidate;\n      }\n    }));\n    enriched.push(...values);\n  }\n  return enriched;\n}''',
'''async function enrichCandidates(key: string, candidates: PlaceCandidate[]) {\n  const enriched: PlaceCandidate[] = [];\n  for (let index = 0; index < candidates.length; index += 5) {\n    const batch = candidates.slice(index, index + 5);\n    const values = await Promise.all(batch.map(async (candidate) => {\n      try {\n        const detailed = mergeDetails(candidate.place, await placeDetails(key, candidate.place.id));\n        const contact = await enrichPublicBusinessContact({ website: detailed.website, phone: detailed.phone, email: detailed.email });\n        return {\n          ...candidate,\n          place: {\n            ...detailed,\n            phone: contact.phone ?? detailed.phone,\n            email: contact.email ?? detailed.email,\n            website: contact.website ?? detailed.website,\n            contactPerson: contact.contactPerson,\n            contactRole: contact.contactRole,\n            enrichmentStatus: contact.status,\n            enrichmentConfidence: contact.confidence,\n            enrichmentSource: contact.source,\n          },\n        };\n      } catch {\n        return { ...candidate, place: { ...candidate.place, enrichmentStatus: "unresolved" as const, enrichmentConfidence: 0, enrichmentSource: "none" } };\n      }\n    }));\n    enriched.push(...values);\n  }\n  return enriched;\n}''')

replace(p,
'''          website_url: clip(place.website, 1000),\n          phone: clip(place.phone, 60),\n          email: clip(place.email, 254),''',
'''          website_url: clip(place.website, 1000),\n          phone: clip(place.phone, 60),\n          email: clip(place.email, 254),\n          contact_person: clip(place.contactPerson, 120),\n          contact_role: clip(place.contactRole, 120),\n          enrichment_status: place.enrichmentStatus,\n          enrichment_confidence: place.enrichmentConfidence,\n          enrichment_source: clip(place.enrichmentSource, 120),\n          enriched_at: new Date().toISOString(),''')

replace(p,
'''.select("id,provider,provider_place_id,business_name,formatted_address,primary_type,google_maps_url,niche,target_problem,status")''',
'''.select("id,provider,provider_place_id,business_name,formatted_address,primary_type,google_maps_url,phone,email,website_url,niche,target_problem,status")''')

replace(p,
'''    phone: null,\n    email: null,\n    website: null,\n    openingHours: null,''',
'''    phone: result.phone,\n    email: result.email,\n    website: result.website_url,\n    contactPerson: null,\n    contactRole: null,\n    enrichmentStatus: "pending",\n    enrichmentConfidence: null,\n    enrichmentSource: null,\n    openingHours: null,''')

replace(p,
'''  const score = calculateScore(merged, result.niche, result.target_problem);''',
'''  const contact = await enrichPublicBusinessContact({ website: merged.website, phone: merged.phone, email: merged.email });\n  const enrichedMerged: LeadPlace = {\n    ...merged,\n    phone: contact.phone ?? merged.phone,\n    email: contact.email ?? merged.email,\n    website: contact.website ?? merged.website,\n    contactPerson: contact.contactPerson,\n    contactRole: contact.contactRole,\n    enrichmentStatus: contact.status,\n    enrichmentConfidence: contact.confidence,\n    enrichmentSource: contact.source,\n  };\n  const score = calculateScore(enrichedMerged, result.niche, result.target_problem);''')

for old, new in [
('business_name: merged.name.slice(0, 200)', 'business_name: enrichedMerged.name.slice(0, 200)'),
('formatted_address: clip(merged.formattedAddress, 500)', 'formatted_address: clip(enrichedMerged.formattedAddress, 500)'),
('primary_type: clip(merged.primaryType, 120)', 'primary_type: clip(enrichedMerged.primaryType, 120)'),
('google_maps_url: clip(merged.mapUrl, 1000)', 'google_maps_url: clip(enrichedMerged.mapUrl, 1000)'),
('phone: clip(merged.phone, 60)', 'phone: clip(enrichedMerged.phone, 60)'),
('email: clip(merged.email, 254)', 'email: clip(enrichedMerged.email, 254)'),
('website_url: clip(merged.website, 1000)', 'website_url: clip(enrichedMerged.website, 1000)'),
]:
    replace(p, old, new)

replace(p,
'''      website_url: clip(enrichedMerged.website, 1000),\n      fit_score: score.fit,''',
'''      website_url: clip(enrichedMerged.website, 1000),\n      contact_person: clip(enrichedMerged.contactPerson, 120),\n      contact_role: clip(enrichedMerged.contactRole, 120),\n      enrichment_status: enrichedMerged.enrichmentStatus,\n      enrichment_confidence: enrichedMerged.enrichmentConfidence,\n      enrichment_source: clip(enrichedMerged.enrichmentSource, 120),\n      enriched_at: new Date().toISOString(),\n      fit_score: score.fit,''')

replace(p,
'''  const { data, error } = await supabase.from("lead_finder_results").select("*").eq("id", id).eq("workspace_id", workspace.id).single();\n  if (error || !data) return { outcome: "failed" as const, businessName: "Lead" };\n  if (data.status === "approved") return { outcome: "approved" as const, businessName: data.business_name };\n  if (data.status !== "analyzed") return { outcome: "not_ready" as const, businessName: data.business_name };''',
'''  const { data: fetched, error } = await supabase.from("lead_finder_results").select("*").eq("id", id).eq("workspace_id", workspace.id).single();\n  let data = fetched;\n  if (error || !data) return { outcome: "failed" as const, businessName: "Lead" };\n  if (data.status === "approved") return { outcome: "approved" as const, businessName: data.business_name };\n  if (data.status !== "analyzed") return { outcome: "not_ready" as const, businessName: data.business_name };\n\n  if (data.provider === PROVIDER && !data.enriched_at) {\n    const contact = await enrichPublicBusinessContact({ website: data.website_url, phone: data.phone, email: data.email });\n    const enrichmentPatch = {\n      phone: clip(contact.phone, 60),\n      email: clip(contact.email, 254),\n      website_url: clip(contact.website, 1000),\n      contact_person: clip(contact.contactPerson, 120),\n      contact_role: clip(contact.contactRole, 120),\n      enrichment_status: contact.status,\n      enrichment_confidence: contact.confidence,\n      enrichment_source: clip(contact.source, 120),\n      enriched_at: new Date().toISOString(),\n    };\n    const { error: enrichmentError } = await supabase.from("lead_finder_results").update(enrichmentPatch).eq("id", data.id).eq("workspace_id", workspace.id);\n    if (enrichmentError) return { outcome: "failed" as const, businessName: data.business_name };\n    data = { ...data, ...enrichmentPatch };\n  }''')

replace(p,
'''    data.formatted_address ? `Address: ${data.formatted_address}` : null,\n    `Discovered through Orbit Lead Finder.''',
'''    data.formatted_address ? `Address: ${data.formatted_address}` : null,\n    data.contact_person ? `Decision maker: ${data.contact_person}${data.contact_role ? ` · ${data.contact_role}` : ""}` : "Decision maker: not publicly verified",\n    `Discovered through Orbit Lead Finder.''')

replace(p,
'''      email: clip(data.email, 254),\n      phone: clip(data.phone, 40),\n      whatsapp: clip(data.phone, 40),''',
'''      email: clip(data.email, 254),\n      phone: clip(data.phone, 40),\n      whatsapp: clip(data.phone, 40),\n      contact_person: clip(data.contact_person, 120),\n      contact_role: clip(data.contact_role, 120),\n      website_url: clip(data.website_url, 1000),\n      enrichment_status: data.enrichment_status ?? "unresolved",\n      enrichment_confidence: data.enrichment_confidence,\n      enrichment_source: clip(data.enrichment_source, 120),\n      enriched_at: data.enriched_at ?? new Date().toISOString(),''')

# Shared Lead type
p = "src/lib/types.ts"
replace(p,
'''  phone: string | null;\n  whatsapp: string | null;''',
'''  phone: string | null;\n  whatsapp: string | null;\n  contact_person: string | null;\n  contact_role: string | null;\n  website_url: string | null;\n  enrichment_status: string | null;\n  enrichment_confidence: number | null;\n  enrichment_source: string | null;\n  enriched_at: string | null;''')

# Add Lead / review UI
p = "src/app/(app)/dashboard/leads/add/page.tsx"
replace(p,
'''  email: string | null;\n  niche: string;''',
'''  email: string | null;\n  contact_person: string | null;\n  contact_role: string | null;\n  enrichment_status: string | null;\n  enrichment_confidence: number | null;\n  niche: string;''')

replace(p,
'''.select("id,name,company,email,phone,whatsapp,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")''',
'''.select("id,name,company,email,phone,whatsapp,contact_person,contact_role,website_url,enrichment_status,enrichment_confidence,enrichment_source,enriched_at,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")''')

replace(p,
'''.select("id,business_name,formatted_address,primary_type,business_status,google_maps_url,website_url,phone,email,niche,total_score,detected_weakness,recommended_offer,status,lead_id,created_at")''',
'''.select("id,business_name,formatted_address,primary_type,business_status,google_maps_url,website_url,phone,email,contact_person,contact_role,enrichment_status,enrichment_confidence,niche,total_score,detected_weakness,recommended_offer,status,lead_id,created_at")''')

replace(p,
'''                            <span>{result.phone ? "Phone found" : "No phone"}</span>\n                            <span>{result.email ? "Email found" : "No email"}</span>''',
'''                            <span>{result.contact_person ? `${result.contact_person}${result.contact_role ? ` · ${humanize(result.contact_role)}` : ""}` : "Owner/contact not verified"}</span>\n                            <span>{result.phone ? "Phone found" : "No phone"}</span>\n                            <span>{result.email ? "Email found" : "No email"}</span>''')

replace(p,
'''<div><strong>Enrich & Score</strong><p>Public phone, email, website and place data are enriched when available.</p></div>''',
'''<div><strong>Enrich & Score</strong><p>Orbit resolves public owner/contact person, role, phone, email and website before approval.</p></div>''')

replace(p,
'''const text = [lead.company, lead.name, lead.niche, lead.pain_point, lead.next_action].filter(Boolean).join(" ").toLowerCase();''',
'''const text = [lead.company, lead.name, lead.contact_person, lead.contact_role, lead.email, lead.phone, lead.niche, lead.pain_point, lead.next_action].filter(Boolean).join(" ").toLowerCase();''')

replace(p,
'''<td><div className={engineStyles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>''',
'''<td><div className={engineStyles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.contact_person ? `${lead.contact_person}${lead.contact_role ? ` · ${humanize(lead.contact_role)}` : ""}` : lead.niche ?? "Niche not set"}</small></div></div></td>''')

# Local Search source list
p = "src/app/(app)/dashboard/leads/sources/[source]/page.tsx"
replace(p,
'''.select("id,name,company,email,phone,whatsapp,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")''',
'''.select("id,name,company,email,phone,whatsapp,contact_person,contact_role,website_url,enrichment_status,enrichment_confidence,enrichment_source,enriched_at,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")''')

replace(p,
'''<thead><tr><th>Lead</th><th>Score</th><th>Status</th><th>Next action</th><th>Source link</th><th>Added</th></tr></thead>''',
'''<thead><tr><th>Lead</th><th>Contact</th><th>Score</th><th>Status</th><th>Next action</th><th>Source link</th><th>Added</th></tr></thead>''')

replace(p,
'''<td><div className={styles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>\n                    <td><span className={styles.scorePill}>{lead.lead_score ?? "—"}</span></td>''',
'''<td><div className={styles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>\n                    <td><strong>{lead.contact_person ?? "Not verified"}</strong><small>{lead.contact_role ? humanize(lead.contact_role) : lead.phone ?? lead.email ?? "No public contact"}</small></td>\n                    <td><span className={styles.scorePill}>{lead.lead_score ?? "—"}</span></td>''')

print("Geo lead enrichment patch applied")
