import { redirect } from "next/navigation";

export default function SecurityRoute() {
  redirect("/dashboard/organisation");
}
