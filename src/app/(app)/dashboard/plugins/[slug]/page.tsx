import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string; error?: string; connect?: string }>;
};

export default async function LegacyPluginDetailRedirect({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const target = new URLSearchParams();
  target.set("plugin", `plugin:${slug}`);
  if (query.notice) target.set("notice", query.notice);
  if (query.error) target.set("error", query.error);
  if (query.connect === "1") target.set("connect", slug === "geoapify-lead-discovery" ? "geoapify" : query.connect);
  redirect(`/dashboard/plugins?${target.toString()}`);
}
