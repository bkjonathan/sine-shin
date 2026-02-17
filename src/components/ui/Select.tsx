import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  required?: boolean;
  menuPlacement?: "auto" | "top" | "bottom";
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  label,
  required = false,
  menuPlacement = "auto",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">(
    "bottom",
  );
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        className={`input-liquid w-full flex items-center justify-between cursor-pointer transition-all ${
          isOpen
            ? "!border-[var(--color-accent-blue)] bg-[var(--color-glass-white-hover)] shadow-[0_0_0_3px_rgba(91,127,255,0.25)]"
            : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
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
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--color-text-muted)] transition-transform duration-200 ml-2 flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Options Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
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
                <div
                  key={option.value}
                  className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
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
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--color-text-muted)] text-center italic">
                No options available
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
