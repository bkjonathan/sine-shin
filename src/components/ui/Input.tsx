import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  wrapperClassName?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, wrapperClassName, id, name, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? name ?? `input-${generatedId}`;
    const errorId = error ? `${inputId}-error` : undefined;

    const inputNode = (
      <input
        id={inputId}
        ref={ref}
        className={joinClasses(
          "input-liquid",
          error &&
            "border-red-500/50 focus:!shadow-[0_0_0_3px_rgba(248,113,113,0.2),0_0_20px_rgba(248,113,113,0.1)]",
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...props}
      />
    );

    if (!label && !error && !wrapperClassName) {
      return inputNode;
    }

    return (
      <div className={wrapperClassName}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
          >
            {label}
          </label>
        )}
        {inputNode}
        {error && (
          <p
            id={errorId}
            className="mt-1 text-xs text-[var(--color-error)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
