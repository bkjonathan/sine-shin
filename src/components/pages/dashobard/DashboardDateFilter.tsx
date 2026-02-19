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
  const dateTo = formatDate(today);

  switch (preset) {
    case "this_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = 0
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { dateFrom: formatDate(monday), dateTo };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: formatDate(first), dateTo };
    }
    case "three_months": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      return { dateFrom: formatDate(d), dateTo };
    }
    case "six_months": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      return { dateFrom: formatDate(d), dateTo };
    }
    case "this_year": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { dateFrom: formatDate(first), dateTo };
    }
    default:
      return { dateFrom: "", dateTo: "" };
  }
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
      onChange({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
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
        onChange({ ...range, dateField: field, preset: value.preset });
      } else {
        onChange({ ...value, dateField: field });
      }
    },
    [onChange, value],
  );

  const handleCustomFrom = useCallback(
    (date: Date | null) => {
      if (!date) return;
      onChange({ ...value, dateFrom: formatDate(date), preset: "custom" });
    },
    [onChange, value],
  );

  const handleCustomTo = useCallback(
    (date: Date | null) => {
      if (!date) return;
      onChange({ ...value, dateTo: formatDate(date), preset: "custom" });
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
    <div className="mb-6 glass-panel p-4 relative z-50">
      <div className="flex flex-col gap-3">
        {/* Row 1: Presets + Date field selector */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Preset pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border
                  ${
                    value.preset === preset
                      ? "bg-accent-blue/20 text-accent-blue border-accent-blue/40 shadow-[0_0_12px_rgba(91,127,255,0.15)]"
                      : "bg-glass-white border-glass-border text-text-secondary hover:bg-glass-white-hover hover:text-text-primary"
                  }
                `}
              >
                {t(PRESET_KEYS[preset])}
              </button>
            ))}
          </div>

          {/* Date field selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFieldOpen(!fieldOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-glass-white border border-glass-border text-text-secondary hover:bg-glass-white-hover hover:text-text-primary transition-all duration-200"
            >
              <Calendar size={13} className="opacity-60" />
              <span>
                {t("dashboard.filter_by")}:{" "}
                {value.dateField === "order_date"
                  ? t("dashboard.order_date_field")
                  : t("dashboard.created_date_field")}
              </span>
              <ChevronDown
                size={13}
                className={`opacity-60 transition-transform duration-200 ${fieldOpen ? "rotate-180" : ""}`}
              />
            </button>

            {fieldOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setFieldOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] glass-panel border border-glass-border-light shadow-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleFieldChange("order_date")}
                    className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${
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
                    className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${
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
        </div>

        {/* Row 2: Custom date pickers (only when custom is selected) */}
        {value.preset === "custom" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">
                {t("dashboard.date_from")}
              </span>
              <div className="w-40">
                <DatePicker
                  selected={customFromDate}
                  onChange={handleCustomFrom}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="YYYY-MM-DD"
                  maxDate={customToDate || new Date()}
                  className="py-1.5! px-2.5! text-xs! rounded-lg!"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">
                {t("dashboard.date_to")}
              </span>
              <div className="w-40">
                <DatePicker
                  selected={customToDate}
                  onChange={handleCustomTo}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="YYYY-MM-DD"
                  minDate={customFromDate || undefined}
                  maxDate={new Date()}
                  className="py-1.5! px-2.5! text-xs! rounded-lg!"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { computeRange };
