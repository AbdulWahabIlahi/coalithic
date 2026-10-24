import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[#dbe7e1] bg-white px-3 py-1 text-sm text-[#1e293b] shadow-sm transition-colors placeholder:text-[#94a3b8]",
        "focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
