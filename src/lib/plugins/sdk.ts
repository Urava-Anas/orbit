import { orbitPluginManifestV1Schema, type OrbitPluginManifestV1 } from "@/lib/plugins/contracts";

export const ORBIT_PLUGIN_MANIFEST_VERSION = "1" as const;
export const ORBIT_MCP_PROTOCOL_VERSION = "2026-07-28" as const;
export const ORBIT_PLUGIN_RUNTIME_LIMITS = Object.freeze({
  maxTools: 100,
  maxArgumentsBytes: 64 * 1024,
  maxInputSchemaBytes: 96 * 1024,
  maxResponseBytes: 2 * 1024 * 1024,
  requestTimeoutMs: 15_000,
});

export function defineOrbitPlugin<const T extends OrbitPluginManifestV1>(manifest: T): T {
  orbitPluginManifestV1Schema.parse(manifest);
  return manifest;
}

export function validateOrbitPluginManifest(value: unknown) {
  const result = orbitPluginManifestV1Schema.safeParse(value);
  if (result.success) {
    return { ok: true as const, manifest: result.data, issues: [] as string[] };
  }
  return {
    ok: false as const,
    manifest: null,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "manifest";
      return `${path}: ${issue.message}`;
    }),
  };
}

export const orbitPluginExample: OrbitPluginManifestV1 = {
  schema_version: "1",
  id: "example-growth-tool",
  name: "Example Growth Tool",
  description: "Example plugin manifest for the Orbit v1 marketplace and MCP runtime.",
  version: "1.0.0",
  category: "Growth",
  developer: {
    name: "Example Developer",
    url: "https://example.com",
  },
  skills: [
    {
      id: "inspect-growth",
      name: "Inspect Growth",
      description: "Turn approved growth signals into structured observations.",
    },
  ],
  apps: [],
  workflows: [
    {
      id: "growth-review",
      name: "Growth Review",
      description: "Review approved data and return a bounded next-action recommendation.",
    },
  ],
  permissions: ["workspace.read"],
  orbit_modules: ["growth"],
  mcp: {
    transport: "streamable-http",
    url: "https://plugins.example.com/mcp",
  },
};
