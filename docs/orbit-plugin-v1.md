# Orbit Plugin SDK v1

Orbit plugins extend the product without adding third-party code to Orbit's core runtime. A plugin is a reviewed manifest describing skills, connected apps, workflows, permissions, supported Orbit modules, and optionally a remote MCP endpoint.

## Manifest

Use `examples/orbit.plugin.json` as the canonical starter. The manifest schema is version `1`. Plugin IDs and permission IDs are lower-case identifiers. Versions use semantic versioning. Developer and MCP URLs must use HTTPS.

A plugin can declare:

- `skills`: reusable bounded capabilities presented to Orbit.
- `apps`: providers already authorized through Orbit Connect. Plugins never ask normal users to paste provider secrets.
- `workflows`: reusable workflow descriptions.
- `permissions`: the complete capability boundary the organisation approves at install/update time.
- `orbit_modules`: surfaces where the plugin may appear.
- `mcp`: optional Streamable HTTP endpoint owned and operated by the plugin developer.

## Review lifecycle

1. Register a publisher for an Orbit organisation.
2. Validate the manifest locally or through Orbit's developer page.
3. Submit the manifest to the marketplace review queue.
4. Orbit review verifies identity, permissions and runtime endpoint.
5. Approved versions are written to immutable `plugin_versions` records and promoted to the public catalog.
6. Organisations install the plugin and explicitly approve its permission set.
7. If a later version adds permissions or changes its MCP endpoint, existing installations move to `pending_review` and execution stops until an organisation admin approves the update.

No third-party publisher can directly write the public plugin catalog or approved plugin versions.

## MCP runtime contract

Orbit v1 expects MCP protocol `2026-07-28` over HTTPS Streamable HTTP. Remote endpoints must use public HTTPS on port 443. Orbit blocks local/private/reserved network destinations and redirects, bounds request/response sizes, caches tool discovery briefly, rate-limits invocations and records only security/audit digests instead of raw arguments or outputs.

Orbit sends `server/discover`, then `tools/list`, and invokes approved tools with `tools/call`. Tool definitions are untrusted input. Orbit validates tool names and input schemas before exposing them to the Operator. Remote tool calls remain approval-gated in Orbit.

## Runtime limits

- Maximum tools per plugin: 100
- Maximum tool arguments: 64 KiB
- Maximum input schema: 96 KiB
- Maximum response body: 2 MiB
- Request timeout: 15 seconds
- Default invocation governor: 30 calls per minute per workspace/actor

These limits can tighten in later Orbit releases. Developers must not depend on larger payloads.

## Cost model

Orbit stores marketplace, installation, connection binding, routing and audit metadata in its existing stack. A third-party developer hosts their own MCP/API compute. External providers continue to own their service infrastructure. This avoids a dedicated per-plugin execution fleet inside Orbit.

## Security rules

Do not place API keys, OAuth tokens, passwords or credentials in a plugin manifest or MCP URL. Provider credentials belong to Orbit Connect and remain server-side. Do not depend on undocumented permissions. A manifest may only invoke capabilities explicitly approved by the installing organisation. Approved marketplace versions are immutable; publish a new semantic version for every change.
