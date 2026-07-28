"use client";

import { useFormStatus } from "react-dom";

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="google-mark"
      viewBox="0 0 24 24"
    >
      <path
        d="M21.6 12.23c0-.71-.06-1.22-.2-1.75h-9.2v3.34h5.4a4.7 4.7 0 0 1-2 3.03l-.02.11 2.9 2.24.2.02c1.84-1.7 2.92-4.2 2.92-6.99"
        fill="#4285F4"
      />
      <path
        d="M12.2 21.8c2.63 0 4.84-.87 6.46-2.37l-3.08-2.37c-.82.55-1.93.94-3.38.94a5.87 5.87 0 0 1-5.55-4.06l-.1.01-3.02 2.34-.04.1a9.75 9.75 0 0 0 8.71 5.41"
        fill="#34A853"
      />
      <path
        d="M6.65 13.94a6 6 0 0 1-.32-1.94c0-.68.12-1.34.31-1.94v-.11L3.58 7.58l-.1.05A9.8 9.8 0 0 0 2.4 12c0 1.57.38 3.06 1.08 4.37z"
        fill="#FBBC05"
      />
      <path
        d="M12.2 6c1.83 0 3.06.79 3.77 1.45l2.75-2.69A9.35 9.35 0 0 0 12.2 2.2a9.75 9.75 0 0 0-8.71 5.43l3.15 2.43A5.9 5.9 0 0 1 12.2 6"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className="button button-google"
      disabled={pending}
      type="submit"
    >
      <GoogleMark />
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
