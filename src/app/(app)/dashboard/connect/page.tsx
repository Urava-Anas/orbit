import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Plugins · Orbit",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{
    integration?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function ConnectRedirectPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const params = new URLSearchParams();

  if (query.integration) params.set("connection", query.integration);
  if (query.notice) params.set("notice", query.notice);
  if (query.error) params.set("error", query.error);

  const suffix = params.toString();
  redirect(suffix ? `/dashboard/plugins?${suffix}` : "/dashboard/plugins");
}
