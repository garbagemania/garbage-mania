"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button for Server Action forms: disables itself and shows progress while the action runs. */
export function SubmitButton({
  children,
  pendingLabel = "Please wait…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
