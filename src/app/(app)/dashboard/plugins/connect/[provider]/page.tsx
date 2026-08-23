import { notFound } from "next/navigation";
import { OAuthConnectionLauncher } from "./OAuthConnectionLauncher";

type PageProps = {
  params: Promise<{ provider: string }>;
};

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  vercel: "Vercel",
  google_search_console: "Search Console",
  google_analytics: "Google Analytics",
  meta: "Meta",
  linkedin: "LinkedIn",
};

export default async function PluginConnectionPage({ params }: PageProps) {
  const { provider } = await params;
  const label = PROVIDER_LABELS[provider];
  if (!label) notFound();

  return <OAuthConnectionLauncher provider={provider} label={label} />;
}
