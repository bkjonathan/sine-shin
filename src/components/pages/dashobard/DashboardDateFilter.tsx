import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronDown } from "lucide-react";
import DatePicker from "../../ui/DatePicker";

export type DatePreset =
  | "this_week"
  | "this_month"
  | "three_months"
  | "six_months"
  | "this_year"
  | "custom";

export type DateField = "order_date" | "created_at";

export interface DateFilterValue {
  dateFrom: string;
  dateTo: string;
  dateField: DateField;
  preset: DatePreset;
}

interface DashboardDateFilterProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRange(preset: DatePreset): {
  dateFrom: string;
  dateTo: string;
} {
  const today = new Date();

  switch (preset) {
    case "this_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { dateFrom: formatDate(monday), dateTo: formatDate(sunday) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { dateFrom: formatDate(first), dateTo: formatDate(last) };
    }
    case "three_months": {
      const first = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { dateFrom: formatDate(first), dateTo: formatDate(last) };
    }
    case "six_months": {
      const first = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { dateFrom: formatDate(first), dateTo: formatDate(last) };
    }
    case "this_year": {
      const first = new Date(today.getFullYear(), 0, 1);
      const last = new Date(today.getFullYear(), 11, 31);
      return { dateFrom: formatDate(first), dateTo: formatDate(last) };
    }
    default:
      return { dateFrom: "", dateTo: "" };
  }
}

function normalizeDateRange(dateFrom: string, dateTo: string): {
  dateFrom: string;
  dateTo: string;
} {
  if (!dateFrom || !dateTo) {
    return { dateFrom, dateTo };
  }

  if (dateFrom <= dateTo) {
    return { dateFrom, dateTo };
  }

  return { dateFrom: dateTo, dateTo: dateFrom };
}

const PRESETS: DatePreset[] = [
  "this_week",
  "this_month",
  "three_months",
  "six_months",
  "this_year",
  "custom",
];

const PRESET_KEYS: Record<DatePreset, string> = {
  this_week: "dashboard.this_week",
  this_month: "dashboard.this_month",
  three_months: "dashboard.three_months",
  six_months: "dashboard.six_months",
  this_year: "dashboard.this_year",
  custom: "dashboard.custom",
};

export default function DashboardDateFilter({
  value,
  onChange,
}: DashboardDateFilterProps) {
  const { t } = useTranslation();
  const [fieldOpen, setFieldOpen] = useState(false);

  const handlePreset = useCallback(
    (preset: DatePreset) => {
      if (preset === "custom") {
        onChange({ ...value, preset: "custom" });
        return;
      }
      const range = computeRange(preset);
      const normalizedRange = normalizeDateRange(range.dateFrom, range.dateTo);
      onChange({
        dateFrom: normalizedRange.dateFrom,
        dateTo: normalizedRange.dateTo,
        dateField: value.dateField,
        preset,
      });
    },
    [onChange, value],
  );

  const handleFieldChange = useCallback(
    (field: DateField) => {
      setFieldOpen(false);
      if (value.preset !== "custom") {
        const range = computeRange(value.preset);
        const normalizedRange = normalizeDateRange(range.dateFrom, range.dateTo);
        onChange({ ...normalizedRange, dateField: field, preset: value.preset });
      } else {
        onChange({ ...value, dateField: field });
      }
    },
    [onChange, value],
  );

  const handleCustomFrom = useCallback(
    (date: Date | null) => {
      if (!date) return;
      const nextFrom = formatDate(date);
      const normalizedRange = normalizeDateRange(nextFrom, value.dateTo);
      onChange({
        ...value,
        dateFrom: normalizedRange.dateFrom,
        dateTo: normalizedRange.dateTo,
        preset: "custom",
      });
    },
    [onChange, value],
  );

  const handleCustomTo = useCallback(
    (date: Date | null) => {
      if (!date) return;
      const nextTo = formatDate(date);
      const normalizedRange = normalizeDateRange(value.dateFrom, nextTo);
      onChange({
        ...value,
        dateFrom: normalizedRange.dateFrom,
        dateTo: normalizedRange.dateTo,
        preset: "custom",
      });
    },
    [onChange, value],
  );

  const customFromDate = useMemo(
    () => (value.dateFrom ? new Date(value.dateFrom + "T00:00:00") : null),
    [value.dateFrom],
  );

  const customToDate = useMemo(
    () => (value.dateTo ? new Date(value.dateTo + "T00:00:00") : null),
    [value.dateTo],
  );

  return (
    <div className="relative z-50">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Preset chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePreset(preset)}
              className={`
                px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 border
                ${
                  value.preset === preset
                    ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30 shadow-[0_0_8px_rgba(91,127,255,0.1)]"
                    : "bg-glass-white border-glass-border text-text-muted hover:bg-glass-white-hover hover:text-text-primary"
                }
              `}
            >
              {t(PRESET_KEYS[preset])}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-glass-border mx-1" />

        {/* Date field selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFieldOpen(!fieldOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-glass-white border border-glass-border text-text-muted hover:bg-glass-white-hover hover:text-text-primary transition-all duration-200"
          >
            <Calendar size={12} className="opacity-60" />
            <span>
              {value.dateField === "order_date"
                ? t("dashboard.order_date_field")
                : t("dashboard.created_date_field")}
            </span>
            <ChevronDown
              size={12}
              className={`opacity-60 transition-transform duration-200 ${fieldOpen ? "rotate-180" : ""}`}
            />
          </button>

          {fieldOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFieldOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] glass-panel border border-glass-border-light shadow-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleFieldChange("order_date")}
                  className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                    value.dateField === "order_date"
                      ? "bg-accent-blue/10 text-accent-blue font-medium"
                      : "text-text-secondary hover:bg-glass-white-hover hover:text-text-primary"
                  }`}
                >
                  {t("dashboard.order_date_field")}
                </button>
                <button
                  type="button"
                  onClick={() => handleFieldChange("created_at")}
                  className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                    value.dateField === "created_at"
                      ? "bg-accent-blue/10 text-accent-blue font-medium"
                      : "text-text-secondary hover:bg-glass-white-hover hover:text-text-primary"
                  }`}
                >
                  {t("dashboard.created_date_field")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Custom date pickers inline */}
        {value.preset === "custom" && (
          <>
            <div className="w-px h-5 bg-glass-border mx-1" />
            <div className="flex items-center gap-2">
              <div className="w-36">
                <DatePicker
                  selected={customFromDate}
                  onChange={handleCustomFrom}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="From"
                  maxDate={customToDate || new Date()}
                  className="py-1! px-2! text-xs! rounded-lg!"
                />
              </div>
              <span className="text-xs text-text-muted">–</span>
              <div className="w-36">
                <DatePicker
                  selected={customToDate}
                  onChange={handleCustomTo}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="To"
                  minDate={customFromDate || undefined}
                  maxDate={new Date()}
                  className="py-1! px-2! text-xs! rounded-lg!"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { computeRange };
