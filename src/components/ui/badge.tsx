import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneStyles: Record<Tone, string> = {
  success: "bg-brand-green-50 text-brand-green-700",
  warning: "bg-brand-yellow-50 text-brand-yellow-700",
  danger: "bg-red-50 text-danger",
  info: "bg-blue-50 text-info",
  neutral: "bg-neutral-100 text-neutral-700",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
