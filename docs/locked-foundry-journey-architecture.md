# Locked Foundry Journey Architecture

Orbit Foundry uses one canonical member journey model:

Organisation → Member → Journey Map → Level → Class → Notes / PDF → Task → Evidence → Achievement → Studio Work → Next Move

Rules:
- The Journey Map is a projection of source records, never a duplicate database.
- Student and admin views use the same map component. Admin controls are additive.
- Classes, resources, tasks and Studio assignments are level-aware and appear on the map.
- Tasks are viewed per selected student as past, current and upcoming work.
- Studio assigns members to real Orbit projects with role, deliverable, level and timing.
- Connect is organisation-level navigation, not a Foundry-only section.
- Foundry Ops is Activity & Automation: loop health, sync, notifications, failures and audit signals.
- Authentication is one-way: sign in once, resolve identity/role, open the correct workspace; OAuth codes must never strand users on the public landing page.
