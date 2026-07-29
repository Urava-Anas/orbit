"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

type FoundryActionButtonProps = {
  children: ReactNode;
  className: string;
  pendingLabel: string;
  name?: string;
  value?: string;
};

export function FoundryActionButton({
  children,
  className,
  pendingLabel,
  name,
  value,
}: FoundryActionButtonProps) {
  const { data, pending } = useFormStatus();
  const isSubmittingButton =
    pending && (!name || data?.get(name)?.toString() === value);

  return (
    <button
      aria-disabled={pending}
      className={`${className}${pending ? " is-pending" : ""}`}
      disabled={pending}
      name={name}
      type="submit"
      value={value}
    >
      {isSubmittingButton ? (
        <>
          <LoaderCircle
            aria-hidden="true"
            className="foundry-action-spinner"
            size={16}
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
