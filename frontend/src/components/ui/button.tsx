import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#0d9488] text-white hover:bg-[#0f766e]",
        destructive: "bg-[#dc2626] text-white hover:bg-[#b91c1c]",
        outline: "border border-[#dbe7e1] bg-white text-[#334155] hover:bg-[#f8faf9]",
        secondary: "bg-[#e9f2ed] text-[#0f766e] hover:bg-[#d8ebe3]",
        ghost: "text-[#475569] hover:bg-[#f1f5f4] hover:text-[#1e293b]",
        link: "text-[#0d9488] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 [&_svg]:size-4",
        sm: "h-8 rounded-md px-3 text-[13px] [&_svg]:size-3.5",
        lg: "h-11 rounded-md px-6 [&_svg]:size-4",
        icon: "h-10 w-10 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-4",
        "icon-lg": "h-11 w-11 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
