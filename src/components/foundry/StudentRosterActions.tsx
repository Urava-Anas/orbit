"use client";

import Link from "next/link";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { removeFoundryStudent } from "@/app/(app)/dashboard/foundry/students/actions";

export function StudentRosterActions({
  studentId,
  foundryId,
  studentName,
}: {
  studentId: string;
  foundryId: string;
  studentName: string;
}) {
  return (
    <div className="foundry-row-actions">
      <Link
        className="foundry-button foundry-button-quiet"
        href={`/dashboard/foundry/students/${studentId}/access`}
      >
        <KeyRound aria-hidden="true" size={14} />
        Access
      </Link>
      <Link
        className="foundry-button foundry-button-quiet"
        href={`/dashboard/foundry/students/${studentId}#profile`}
      >
        <Pencil aria-hidden="true" size={14} />
        Edit
      </Link>
      <form
        action={removeFoundryStudent}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Remove ${studentName} (${foundryId}) from the active Foundry? Their history will be preserved.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="studentId" type="hidden" value={studentId} />
        <input name="foundryId" type="hidden" value={foundryId} />
        <button className="foundry-button foundry-button-quiet" type="submit">
          <Trash2 aria-hidden="true" size={14} />
          Remove
        </button>
      </form>
    </div>
  );
}
