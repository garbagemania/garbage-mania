"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Password input with a Show/Hide toggle (helpful on phones, where typos are common). */
export function PasswordInput({
  id = "password",
  name = "password",
  autoComplete = "current-password",
  minLength,
}: {
  id?: string;
  name?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        className="pr-16"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-brand-green-700 hover:text-brand-green-800"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
