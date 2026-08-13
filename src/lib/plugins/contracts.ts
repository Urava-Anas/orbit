import { z } from "zod";

const id = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const semver = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/);

export const orbitPluginManifestV1Schema = z
  .object({
    schema_version: z.literal("1"),
    id,
    name: z.string().min(2).max(80),
    description: z.string().min(8).max(240).optional(),
    version: semver,
    category: z.string().min(2).max(40),
    developer: z
      .object({
        name: z.string().min(2).max(100),
        url: z.string().url().startsWith("https://").optional(),
      })
      .strict(),
    skills: z
      .array(
        z
          .object({
            id,
            name: z.string().min(2).max(80),
            description: z.string().min(4).max(240),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    apps: z
      .array(
        z
          .object({
            provider: id,
            required: z.boolean().default(true),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    workflows: z
      .array(
        z
          .object({
            id,
            name: z.string().min(2).max(100),
            description: z.string().min(4).max(300),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    permissions: z.array(id).max(80).default([]),
    orbit_modules: z.array(id).max(40).default([]),
    mcp: z
      .object({
        transport: z.literal("streamable-http"),
        url: z.string().url().startsWith("https://"),
      })
      .strict()
      .optional(),
  })
  .strict();

export type OrbitPluginManifestV1 = z.infer<typeof orbitPluginManifestV1Schema>;

export function parsePluginManifest(value: unknown) {
  return orbitPluginManifestV1Schema.parse(value);
}

export function safeParsePluginManifest(value: unknown) {
  return orbitPluginManifestV1Schema.safeParse(value);
}

export type PluginInstallStatus =
  | "installed"
  | "disabled"
  | "pending_connections"
  | "pending_review"
  | "revoked";

export type PluginCatalogRecord = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  developer_name: string;
  developer_url: string | null;
  current_version: string;
  status: "published" | "deprecated";
  verified: boolean;
  first_party: boolean;
  publisher_id?: string | null;
  manifest: unknown;
};

export type PluginInstallationRecord = {
  id: string;
  workspace_id: string;
  plugin_id: string;
  version: string;
  status: PluginInstallStatus;
  granted_permissions: string[];
  configuration: Record<string, unknown>;
  installed_by: string | null;
  installed_at: string;
  updated_at: string;
};

export type PluginEventRecord = {
  id: number;
  workspace_id: string;
  plugin_id: string;
  installation_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};
