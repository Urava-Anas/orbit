from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = root / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old}")
    p.write_text(text.replace(old, new, 1))

replace(
    "src/app/(app)/dashboard/leads/finder/actions.ts",
    '    phone: optional(details.contact?.phone),\n    email: optional(details.contact?.email),\n    website: optional(details.website) ?? optional(details.operator_details?.website) ?? optional(details.brand_details?.website),',
    '    phone: optional(details.contact?.phone) ?? place.phone,\n    email: optional(details.contact?.email) ?? place.email,\n    website: optional(details.website) ?? optional(details.operator_details?.website) ?? optional(details.brand_details?.website) ?? place.website,',
)

replace(
    "src/app/(app)/dashboard/leads/add/page.tsx",
    'const slug = source === "referral" ? "referrals" : source === "other" ? "cold-list" : source === "local_search" ? "local-search" : source;',
    'const slug = source === "referral" ? "referrals" : source === "other" ? "cold-list" : source === "local_search" ? "google" : source;',
)

print("Geo enrichment hardening applied")
