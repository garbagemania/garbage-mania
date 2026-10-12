import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            "h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900",
            "placeholder:text-neutral-400",
            "focus-visible:border-brand-green-500",
            error && "border-danger",
            className,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";
