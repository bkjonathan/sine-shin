import { useState, useRef, useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconCheck, IconChevronDown } from "../icons";

export interface Option {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string | number | null | undefined;
  onChange: (value: string | number) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  id?: string;
  menuPlacement?: "auto" | "top" | "bottom";
  emptyStateText?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  label,
  required = false,
  disabled = false,
  error,
  id,
  menuPlacement = "auto",
  emptyStateText = "No options available",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">(
    "bottom",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const errorId = error ? `${triggerId}-error` : undefined;

  const selectedOption = options.find((opt) => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If the dropdown is open and we click outside the container, close it
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (menuPlacement === "top" || menuPlacement === "bottom") {
      setResolvedPlacement(menuPlacement);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const estimatedHeight = Math.min(options.length * 42 + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      setResolvedPlacement("top");
      return;
    }

    setResolvedPlacement("bottom");
  }, [isOpen, menuPlacement, options.length]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  return (
    <div
      className={`relative ${isOpen ? "z-[120]" : "z-0"} ${className}`}
      ref={containerRef}
    >
      {label && (
        <label
          htmlFor={triggerId}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${triggerId}-menu`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={joinClasses(
          "input-liquid w-full flex items-center justify-between text-left transition-all",
          isOpen &&
            "!border-[var(--color-accent-blue)] bg-[var(--color-glass-white-hover)] shadow-[0_0_0_3px_rgba(91,127,255,0.25)]",
          disabled && "opacity-50 cursor-not-allowed",
          error &&
            "!border-red-500/50 !shadow-[0_0_0_3px_rgba(248,113,113,0.2),0_0_20px_rgba(248,113,113,0.1)]",
        )}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
      >
        <span
          className={`truncate ${
            selectedOption
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-muted)]"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <IconChevronDown
          size={16}
          strokeWidth={2}
          className={`text-[var(--color-text-muted)] transition-transform duration-200 ml-2 flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Options Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            id={`${triggerId}-menu`}
            role="listbox"
            aria-labelledby={label ? triggerId : undefined}
            className={`absolute z-50 w-full overflow-hidden glass-panel border border-[var(--color-glass-border-light)] shadow-xl max-h-60 overflow-y-auto ${
              resolvedPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1"
            }`}
            style={{
              backgroundColor: "var(--color-liquid-bg)", // ensure it's opaque enough
              backdropFilter: "blur(20px) saturate(1.8)",
            }}
          >
            {options.length > 0 ? (
              options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={`w-full text-left bg-transparent border-0 px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                    option.value === value
                      ? "bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] font-medium"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-glass-white-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                  {option.value === value && (
                    <IconCheck size={14} strokeWidth={2.5} />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--color-text-muted)] text-center italic">
                {emptyStateText}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
}
