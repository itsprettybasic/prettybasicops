import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "secondary" | "primary" | "blue" | "pos" | "neg" | "ghost";

const VARIANTS: Record<Variant, string> = {
  secondary: "bg-white text-ink-2 border-line hover:border-grey-3",
  primary: "bg-primary text-white border-primary hover:bg-primary-hover px-[18px]",
  blue: "bg-primary-2 text-white border-primary-2 hover:bg-[#1D4ED8] px-[18px]",
  pos: "bg-pos text-white border-pos hover:bg-pos-hover",
  neg: "bg-neg text-white border-neg hover:bg-neg-hover",
  ghost: "bg-transparent text-grey-1 border-transparent hover:text-ink hover:bg-bg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border font-semibold whitespace-nowrap transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        size === "md" ? "px-4 py-[9px] text-[13px]" : "px-2.5 py-1.5 text-xs",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
    </button>
  );
});
