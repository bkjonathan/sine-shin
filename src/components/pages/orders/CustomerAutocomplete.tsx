import { useState, useRef, useEffect, useCallback, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCustomersPaginated } from "../../../api/customerApi";
import { Customer } from "../../../types/customer";
import { IconSearch, IconX, IconCheck } from "../../icons";

interface CustomerAutocompleteProps {
  value: number | null;
  onChange: (customerId: number | null, customer: Customer | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  /** Pre-selected customer to show on mount (e.g. when editing an order) */
  initialCustomer?: Customer | null;
}

export default function CustomerAutocomplete({
  value,
  onChange,
  label,
  required,
  error,
  placeholder = "Search customer...",
  initialCustomer,
}: CustomerAutocompleteProps) {
  const generatedId = useId();
  const inputId = `customer-autocomplete-${generatedId}`;
  const errorId = error ? `${inputId}-error` : undefined;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const abortRef = useRef(0);

  // Sync initial customer when prop changes (e.g. editing a different order)
  useEffect(() => {
    if (initialCustomer) {
      setSelectedCustomer(initialCustomer);
      setQuery("");
    } else if (value === null) {
      setSelectedCustomer(null);
      setQuery("");
    }
  }, [initialCustomer, value]);

  const searchCustomers = useCallback(async (term: string) => {
    const fetchId = ++abortRef.current;
    setIsLoading(true);

    try {
      const data = await getCustomersPaginated({
        page: 1,
        pageSize: 20,
        searchKey: "name",
        searchTerm: term,
        sortBy: "name",
        sortOrder: "asc",
      });

      if (fetchId !== abortRef.current) return;
      setResults(data.customers);
    } catch (err) {
      console.error("Customer search failed:", err);
      if (fetchId !== abortRef.current) return;
      setResults([]);
    } finally {
      if (fetchId === abortRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleInputChange = (text: string) => {
    setQuery(text);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCustomers(text);
    }, 250);
  };

  const handleSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setQuery("");
    setIsOpen(false);
    onChange(customer.id, customer);
  };

  const handleClear = () => {
    setSelectedCustomer(null);
    setQuery("");
    setResults([]);
    onChange(null, null);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsOpen(true);
    searchCustomers(query);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className={`relative ${isOpen ? "z-[120]" : "z-0"}`}
      ref={containerRef}
    >
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Selected state: show chip */}
      {selectedCustomer ? (
        <div
          className={`input-liquid w-full flex items-center justify-between gap-2 ${
            error
              ? "!border-red-500/50 !shadow-[0_0_0_3px_rgba(248,113,113,0.2),0_0_20px_rgba(248,113,113,0.1)]"
              : ""
          }`}
        >
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent-blue/10 text-accent-blue flex items-center justify-center text-[10px] font-bold shrink-0">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-sm text-text-primary truncate block">
                {selectedCustomer.name}
              </span>
              <span className="text-[10px] text-text-muted leading-none">
                {selectedCustomer.customer_id || `#${selectedCustomer.id}`}
                {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded hover:bg-glass-white-hover text-text-muted hover:text-text-primary transition-colors shrink-0"
            aria-label="Clear selection"
          >
            <IconX size={14} strokeWidth={2} />
          </button>
        </div>
      ) : (
        /* Input state: show search box */
        <div
          className={`input-liquid w-full flex items-center gap-2 ${
            isOpen
              ? "!border-[var(--color-accent-blue)] bg-[var(--color-glass-white-hover)] shadow-[0_0_0_3px_rgba(91,127,255,0.25)]"
              : ""
          } ${
            error
              ? "!border-red-500/50 !shadow-[0_0_0_3px_rgba(248,113,113,0.2),0_0_20px_rgba(248,113,113,0.1)]"
              : ""
          }`}
        >
          <IconSearch
            size={14}
            strokeWidth={2}
            className="text-text-muted shrink-0"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder={placeholder}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin shrink-0" />
          )}
        </div>
      )}

      {/* Dropdown Results */}
      <AnimatePresence>
        {isOpen && !selectedCustomer && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 w-full top-full mt-1 overflow-hidden glass-panel border border-[var(--color-glass-border-light)] shadow-xl max-h-60 overflow-y-auto"
            style={{
              backgroundColor: "var(--color-liquid-bg)",
              backdropFilter: "blur(20px) saturate(1.8)",
            }}
          >
            {results.length > 0 ? (
              results.map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  className={`w-full text-left bg-transparent border-0 px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center gap-3 ${
                    customer.id === value
                      ? "bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-glass-white-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                  onClick={() => handleSelect(customer)}
                >
                  <div className="w-7 h-7 rounded-full bg-accent-blue/10 text-accent-blue flex items-center justify-center text-xs font-bold shrink-0">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {customer.name}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {customer.customer_id || `#${customer.id}`}
                      {customer.phone && ` · ${customer.phone}`}
                      {customer.city && ` · ${customer.city}`}
                    </div>
                  </div>
                  {customer.id === value && (
                    <IconCheck
                      size={14}
                      strokeWidth={2.5}
                      className="shrink-0"
                    />
                  )}
                </button>
              ))
            ) : isLoading ? (
              <div className="px-4 py-6 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            ) : query.trim() ? (
              <div className="px-4 py-4 text-sm text-text-muted text-center">
                No customers found
              </div>
            ) : (
              <div className="px-4 py-4 text-sm text-text-muted text-center italic">
                Type to search customers...
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
