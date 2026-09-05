import type { ReactNode } from "react";
import { ContentEngineNav } from "./ContentEngineNav";

export default function ContentEngineLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ContentEngineNav />
      {children}
    </>
  );
}
