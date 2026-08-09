import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadSourceWorkspace } from "../../LeadSourceWorkspace";
import { getLeadSource, leadSources } from "../../source-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return leadSources.map((source) => ({ source: source.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string }>;
}): Promise<Metadata> {
  const { source: sourceSlug } = await params;
  const source = getLeadSource(sourceSlug);

  return {
    title: source ? `${source.label} Control — Lead Engine` : "Source Not Found — Lead Engine",
    description: source?.description,
    robots: { index: false, follow: false },
  };
}

export default async function LeadSourcePage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source: sourceSlug } = await params;
  const source = getLeadSource(sourceSlug);

  if (!source) notFound();

  return <LeadSourceWorkspace source={source} />;
}
