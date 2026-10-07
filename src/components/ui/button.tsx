import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "border border-border-strong text-foreground hover:bg-surface-raised",
        ghost: "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
        danger: "border border-error/50 text-error hover:bg-error/10",
      },
      size: {
        default: "",
        // Compact on pointer-sized screens only; touch screens keep the 44px target.
        sm: "px-3 text-[0.8125rem] sm:min-h-9",
        lg: "min-h-12 px-5 text-[0.9375rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonVariants = VariantProps<typeof variants>;

/** Class names for button-styled elements (links included). Conflicts resolve in favor of `className`. */
export function buttonVariants({
  className,
  ...props
}: ButtonVariants & { className?: string } = {}) {
  return cn(variants(props), className);
}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
