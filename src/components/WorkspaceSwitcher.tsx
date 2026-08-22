"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { switchWorkspace } from "@/app/(app)/dashboard/workspace-actions";
import styles from "./WorkspaceSwitcher.module.css";

type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

type WorkspaceSwitcherProps = {
  currentWorkspace: WorkspaceOption;
  workspaces: WorkspaceOption[];
};

function PendingState() {
  const { pending } = useFormStatus();
  return <span className={styles.pending}>{pending ? "Switching workspace…" : ""}</span>;
}

export function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
}: WorkspaceSwitcherProps) {
  const formRef = useRef<HTMLFormElement>(null);

  if (workspaces.length <= 1) {
    return (
      <div className={styles.staticWorkspace}>
        <small>Active organisation</small>
        <strong>{currentWorkspace.name}</strong>
      </div>
    );
  }

  return (
    <form ref={formRef} action={switchWorkspace} className={styles.switcher}>
      <label htmlFor="orbit-workspace-select">Active organisation</label>
      <select
        id="orbit-workspace-select"
        name="workspace_id"
        defaultValue={currentWorkspace.id}
        aria-label="Change active organisation"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {workspaces.map((workspace) => (
          <option value={workspace.id} key={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <PendingState />
    </form>
  );
}
