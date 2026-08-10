import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceAssetWorkspace } from "@/app/lead-engine/SourceAssetWorkspace";
import { getLeadSource, getSourceAsset, leadSources } from "@/app/lead-engine/source-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return leadSources.flatMap((source) =>
    source.assets.map((asset) => ({ source: source.slug, asset: asset.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string; asset: string }>;
}): Promise<Metadata> {
  const { source: sourceSlug, asset: assetSlug } = await params;
  const source = getLeadSource(sourceSlug);
  const asset = getSourceAsset(sourceSlug, assetSlug);

  return {
    title: source && asset ? `${asset.name} · ${source.label} · Lead Engine` : "Asset Not Found · Lead Engine",
    description: asset?.summary,
    robots: { index: false, follow: false },
  };
}

export default async function SourceAssetPage({
  params,
}: {
  params: Promise<{ source: string; asset: string }>;
}) {
  const { source: sourceSlug, asset: assetSlug } = await params;
  const source = getLeadSource(sourceSlug);
  const asset = getSourceAsset(sourceSlug, assetSlug);
  if (!source || !asset) notFound();
  return <SourceAssetWorkspace source={source} asset={asset} />;
}
