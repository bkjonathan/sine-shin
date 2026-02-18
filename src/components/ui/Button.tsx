import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

type ButtonVariant = "default" | "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: ReactNode;
  fullWidth?: boolean;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "",
  primary: "btn-liquid-primary",
  ghost: "btn-liquid-ghost",
  danger: "bg-red-500 hover:bg-red-600 text-white border-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "default",
      size = "md",
      loading = false,
      loadingText,
      fullWidth = false,
      className,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={joinClasses(
          "btn-liquid",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        )}
        {loading ? (loadingText ?? children) : children}
      </button>
    );
  },
);

Button.displayName = "Button";
