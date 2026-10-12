"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generate(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * Password input with a "Generate" button, for the super admin to set an
 * initial or reset password. The value is visible on purpose so it can be
 * read out or copied to the staff member; it is sent only in the form POST
 * and is never stored or logged by the app.
 */
export function PasswordField({ id = "password", name = "password", label = "Password" }: { id?: string; name?: string; label?: string }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-600">
        {label} <span className="font-normal text-neutral-500">(min 12 characters)</span>
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          type="text"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={12}
          maxLength={72}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={() => setValue(generate())}>
          Generate
        </Button>
      </div>
    </div>
  );
}
