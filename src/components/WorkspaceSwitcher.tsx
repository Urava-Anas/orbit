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
  compact?: boolean;
};

function PendingState({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();

  if (!pending) return null;

  return (
    <span className={compact ? styles.compactPending : styles.pending}>
      {compact ? "Switching…" : "Switching workspace…"}
    </span>
  );
}

export function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
  compact = false,
}: WorkspaceSwitcherProps) {
  const formRef = useRef<HTMLFormElement>(null);

  if (workspaces.length <= 1) {
    return (
      <div className={`${styles.staticWorkspace} ${compact ? styles.compactStatic : ""}`}>
        <small className={compact ? styles.visuallyHidden : undefined}>Active organisation</small>
        <strong title={currentWorkspace.name}>{currentWorkspace.name}</strong>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={switchWorkspace}
      className={`${styles.switcher} ${compact ? styles.compactSwitcher : ""}`}
    >
      <label
        htmlFor={compact ? "orbit-workspace-select-mobile" : "orbit-workspace-select"}
        className={compact ? styles.visuallyHidden : undefined}
      >
        Active organisation
      </label>
      <select
        id={compact ? "orbit-workspace-select-mobile" : "orbit-workspace-select"}
        name="workspace_id"
        defaultValue={currentWorkspace.id}
        aria-label="Change active organisation"
        title={currentWorkspace.name}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {workspaces.map((workspace) => (
          <option value={workspace.id} key={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <PendingState compact={compact} />
    </form>
  );
}
