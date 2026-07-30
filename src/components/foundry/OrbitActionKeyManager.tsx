"use client";

import { Check, Copy, KeyRound, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import {
  createOrbitActionKeyAction,
  initialOrbitActionKeyState,
} from "@/app/(app)/dashboard/foundry/integrations/actions";

export function OrbitActionKeyManager() {
  const [state, formAction, pending] = useActionState(
    createOrbitActionKeyAction,
    initialOrbitActionKeyState,
  );
  const [copied, setCopied] = useState(false);

  async function copyToken() {
    if (!state.token) return;
    await navigator.clipboard.writeText(state.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="foundry-form">
      <form action={formAction} className="foundry-form">
        <div className="foundry-form-grid">
          <label className="is-wide">
            Connection name
            <input
              defaultValue="Mian Anas · Orbit Operator GPT"
              maxLength={120}
              name="name"
              required
            />
          </label>
          <label>
            Key expiry
            <select defaultValue="90" name="expiryDays">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
        </div>
        <button
          className="foundry-button foundry-button-dark"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="spin" size={17} />
          ) : (
            <KeyRound aria-hidden="true" size={17} />
          )}
          {pending ? "Creating secure key…" : "Generate private GPT key"}
        </button>
      </form>

      {state.error ? <p className="foundry-form-error">{state.error}</p> : null}

      {state.token ? (
        <div className="foundry-token-box">
          <div>
            <small>Shown once · store it in the GPT Action authentication field</small>
            <code>{state.token}</code>
          </div>
          <button
            className="foundry-button foundry-button-primary"
            onClick={copyToken}
            type="button"
          >
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copied ? "Copied" : "Copy key"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
