import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function LegacyStudentSubmitPage({ searchParams }: Props) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.notice) params.set("notice", query.notice);
  if (query.error) params.set("error", query.error);
  redirect(`/learn/tasks${params.size ? `?${params.toString()}` : ""}`);
}
