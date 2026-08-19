import "server-only";

import { githubAppReady, vercelIntegrationReady } from "@/lib/integration-connections";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { getPluginMarketplace } from "@/lib/plugins/catalog";
import { requireWorkspace } from "@/lib/workspace";
import { PluginWorkspacePicker, type PluginPickerItem } from "./PluginWorkspacePicker";

type ConnectionRecord = {
  provider: string;
  status: "connected" | "attention" | "disconnected";
};

export async function PluginWorkspaceEntry() {
  const { supabase, workspace } = await requireWorkspace();

  const [plugins, keysResult, connectionsResult] = await Promise.all([
    getPluginMarketplace(supabase, workspace.id),
    listOrbitActionKeys(supabase, workspace.id),
    supabase
      .from("integration_connections")
      .select("provider,status")
      .eq("workspace_id", workspace.id),
  ]);

  const connections = new Map(
    ((connectionsResult.data ?? []) as ConnectionRecord[]).map((record) => [record.provider, record.status]),
  );
  const activeOperator = keysResult.some((key) => key.is_active);

  const appItems: PluginPickerItem[] = [
    {
      id: "github",
      name: "GitHub",
      category: "Code & repositories",
      description: "Give Orbit approved repository access for delivery, automation and website work.",
      status: connections.get("github") === "connected" ? "connected" : githubAppReady() ? "ready" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Agithub",
      tags: ["development", "code", "repositories", "website", "delivery", "automation", "production"],
    },
    {
      id: "vercel",
      name: "Vercel",
      category: "Deployments & projects",
      description: "Connect approved projects so Orbit can inspect and operate production delivery.",
      status: connections.get("vercel") === "connected" ? "connected" : vercelIntegrationReady() ? "ready" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Avercel",
      tags: ["development", "deployment", "website", "production", "delivery", "projects"],
    },
    {
      id: "google_search_console",
      name: "Search Console",
      category: "SEO & indexing",
      description: "Bring verified search visibility and indexing data into Orbit growth workflows.",
      status: connections.get("google_search_console") === "connected" ? "connected" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Agoogle_search_console",
      tags: ["seo", "search", "growth", "website", "analytics", "indexing"],
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Traffic & conversion",
      description: "Measure traffic, behaviour, acquisition and conversion inside Orbit.",
      status: connections.get("google_analytics") === "connected" ? "connected" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Agoogle_analytics",
      tags: ["analytics", "growth", "traffic", "conversion", "evidence", "website"],
    },
    {
      id: "meta",
      name: "Meta",
      category: "Facebook & Instagram",
      description: "Connect approved social assets for marketing, publishing and lead operations.",
      status: connections.get("meta") === "connected" ? "connected" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Ameta",
      tags: ["growth", "lead", "marketing", "publishing", "content", "social", "facebook", "instagram"],
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Professional network",
      description: "Use approved organisation assets for B2B publishing, outreach and lead workflows.",
      status: connections.get("linkedin") === "connected" ? "connected" : "setup",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Alinkedin",
      tags: ["growth", "lead", "marketing", "publishing", "content", "social", "linkedin", "outreach"],
    },
    {
      id: "operator",
      name: "ChatGPT / Orbit Operator",
      category: "AI operator",
      description: "Enable founder-governed AI actions through revocable workspace credentials.",
      status: activeOperator ? "connected" : "ready",
      kind: "app",
      href: "/dashboard/plugins?plugin=app%3Aoperator",
      tags: ["ai", "automation", "operator", "workflow", "operations", "founder"],
    },
  ];

  const pluginItems: PluginPickerItem[] = plugins.map(({ catalog, manifest, installation }) => {
    const effectiveStatus = installation?.status === "revoked" ? null : installation?.status ?? null;
    const status: PluginPickerItem["status"] =
      effectiveStatus === "installed"
        ? "installed"
        : effectiveStatus === "pending_connections" || effectiveStatus === "pending_review"
          ? "setup"
          : "available";

    return {
      id: catalog.slug,
      name: catalog.name,
      category: manifest.category,
      description: catalog.short_description,
      status,
      kind: "plugin",
      href: `/dashboard/plugins?plugin=${encodeURIComponent(`plugin:${catalog.slug}`)}`,
      tags: [
        manifest.category,
        catalog.developer_name,
        ...manifest.orbit_modules,
        ...manifest.skills.flatMap((skill) => [skill.name, skill.description]),
        ...manifest.workflows.flatMap((workflow) => [workflow.name, workflow.description]),
      ],
    };
  });

  return <PluginWorkspacePicker items={[...pluginItems, ...appItems]} workspaceName={workspace.name} />;
}
