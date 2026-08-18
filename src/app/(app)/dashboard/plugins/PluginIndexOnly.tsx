"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function PluginIndexOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname !== "/dashboard/plugins") return null;
  return <>{children}</>;
}
