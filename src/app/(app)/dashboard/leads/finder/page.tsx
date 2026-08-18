import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function LeadFinderRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams({ mode: "google" });
  if (params.error) query.set("error", params.error);
  if (params.notice) query.set("notice", params.notice);
  redirect(`/dashboard/leads/add?${query.toString()}#review-results`);
}
