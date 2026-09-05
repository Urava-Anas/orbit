import { redirect } from "next/navigation";

export default function LegacyContentEngineRoute() {
  redirect("/dashboard/content");
}
