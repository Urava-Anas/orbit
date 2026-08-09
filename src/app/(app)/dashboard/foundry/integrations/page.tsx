import { redirect } from "next/navigation";

export default function LegacyFoundryIntegrationsPage() {
  redirect("/dashboard/connect");
}
