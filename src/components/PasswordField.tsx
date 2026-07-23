"use client";

import type { InputHTMLAttributes } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordField(props: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? "Hide password" : "Show password";

  return (
    <div className="password-input">
      <input {...props} type={isVisible ? "text" : "password"} />
      <button
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        className="password-toggle"
        onClick={() => setIsVisible((visible) => !visible)}
        title={toggleLabel}
        type="button"
      >
        {isVisible ? (
          <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} />
        ) : (
          <Eye aria-hidden="true" size={18} strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}
