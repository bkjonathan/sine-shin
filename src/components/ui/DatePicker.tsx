import { forwardRef } from "react";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface DatePickerProps {
  onChange: (date: Date | null) => void;
  label?: string;
  error?: string;
  className?: string;
  required?: boolean;
  [key: string]: any;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, error, className, required, ...props }, _ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <style>
            {`
            .react-datepicker {
              font-family: inherit;
              background-color: #1e293b;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 0.75rem;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            }
            .react-datepicker__header {
              background-color: #0f172a;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              border-top-left-radius: 0.75rem;
              border-top-right-radius: 0.75rem;
              padding-top: 1rem;
            }
            .react-datepicker__current-month {
              color: #f8fafc;
              font-weight: 600;
              font-size: 0.875rem;
              margin-bottom: 0.5rem;
            }
            .react-datepicker__day-name {
              color: #94a3b8;
              width: 2rem;
              line-height: 2rem;
              margin: 0.166rem;
            }
            .react-datepicker__day {
              color: #f8fafc;
              width: 2rem;
              line-height: 2rem;
              margin: 0.166rem;
              border-radius: 0.5rem;
            }
            .react-datepicker__day:hover {
              background-color: rgba(56, 189, 248, 0.1);
              color: #38bdf8;
            }
            .react-datepicker__day--selected,
            .react-datepicker__day--keyboard-selected {
              background-color: #38bdf8 !important;
              color: #0f172a !important;
              font-weight: 600;
            }
            .react-datepicker__day--today {
              font-weight: bold;
              color: #38bdf8;
            }
            .react-datepicker__day--disabled {
              color: #475569;
            }
            .react-datepicker__navigation {
              top: 1rem;
            }
            .react-datepicker__navigation-icon::before {
              border-color: #94a3b8;
            }
            .react-datepicker__triangle {
              display: none;
            }
            .react-datepicker-popper[data-placement^="bottom"] .react-datepicker__triangle,
            .react-datepicker-popper[data-placement^="top"] .react-datepicker__triangle {
              display: none;
            }
          `}
          </style>
          <ReactDatePicker
            {...props}
            wrapperClassName="w-full"
            className={`
            input-liquid w-full pr-10
            ${error ? "border-red-500/50 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2),0_0_20px_rgba(248,113,113,0.1)]!" : ""}
            ${className}
          `}
            renderCustomHeader={({
              date,
              decreaseMonth,
              increaseMonth,
              prevMonthButtonDisabled,
              nextMonthButtonDisabled,
            }) => (
              <div className="flex items-center justify-between px-2 pb-2">
                <button
                  onClick={decreaseMonth}
                  disabled={prevMonthButtonDisabled}
                  type="button"
                  className={`
                  p-1.5 rounded-lg transition-colors
                  ${prevMonthButtonDisabled ? "opacity-50 cursor-not-allowed text-slate-500" : "text-slate-300 hover:text-white hover:bg-white/10"}
                `}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-sm font-semibold text-slate-100">
                  {date.toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <button
                  onClick={increaseMonth}
                  disabled={nextMonthButtonDisabled}
                  type="button"
                  className={`
                  p-1.5 rounded-lg transition-colors
                  ${nextMonthButtonDisabled ? "opacity-50 cursor-not-allowed text-slate-500" : "text-slate-300 hover:text-white hover:bg-white/10"}
                `}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <Calendar size={18} />
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>
    );
  },
);

DatePicker.displayName = "DatePicker";

export default DatePicker;
