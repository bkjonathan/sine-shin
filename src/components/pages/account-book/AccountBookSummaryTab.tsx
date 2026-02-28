import { useEffect, useState } from "react";
import { motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getAccountSummary } from "../../../api/accountApi";
import { AccountSummary } from "../../../types/accountBook";
import { useAppSettings } from "../../../context/AppSettingsContext";

const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

interface AccountBookSummaryTabProps {
  dateFrom: Date | null;
  dateTo: Date | null;
}

const toDateOnlyString = (value: Date | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function AccountBookSummaryTab({
  dateFrom,
  dateTo,
}: AccountBookSummaryTabProps) {
  const { t } = useTranslation();
  const { formatPrice } = useAppSettings();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const df = toDateOnlyString(dateFrom);
        const dt = toDateOnlyString(dateTo);
        const data = await getAccountSummary(df, dt);
        setSummary(data);
      } catch (error) {
        console.error("Failed to load account summary:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="h-[400px] flex justify-center items-center">
        <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } },
      }}
      className="max-w-4xl mx-auto w-full"
    >
      <motion.div variants={fadeVariants} className="text-center mb-8">
        <h2 className="text-xl text-text-muted mb-2">
          {t("account_book.net_balance", "Net Balance")}
        </h2>
        <div
          className={`text-5xl font-bold ${summary.net_balance >= 0 ? "text-emerald-500" : "text-rose-500"}`}
        >
          {summary.net_balance >= 0 ? "+" : "-"}
          {formatPrice(Math.abs(summary.net_balance))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <motion.div
          variants={fadeVariants}
          className="glass-panel p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
          <h3 className="text-sm uppercase tracking-wider text-text-muted mb-2">
            {t("account_book.total_income", "Total Income")}
          </h3>
          <p className="text-3xl font-bold text-emerald-400">
            {formatPrice(summary.total_income)}
          </p>
          <p className="text-xs text-text-muted mt-4">
            {summary.total_orders.toLocaleString()} orders
          </p>
        </motion.div>

        <motion.div
          variants={fadeVariants}
          className="glass-panel p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
          <h3 className="text-sm uppercase tracking-wider text-text-muted mb-2">
            {t("account_book.total_expenses", "Total Expenses")}
          </h3>
          <p className="text-3xl font-bold text-rose-400">
            {formatPrice(summary.total_expenses)}
          </p>
          <p className="text-xs text-text-muted mt-4">
            {summary.total_expense_records.toLocaleString()} records
          </p>
        </motion.div>
      </div>

      <motion.div variants={fadeVariants} className="glass-panel p-6">
        <h3 className="text-lg font-bold text-text-primary mb-4">
          {t("account_book.this_month", "This Month")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-text-muted mb-1">
              {t("account_book.this_month_income", "Income")}
            </p>
            <p className="text-xl font-bold text-emerald-400">
              {formatPrice(summary.this_month_income)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">
              {t("account_book.this_month_expenses", "Expenses")}
            </p>
            <p className="text-xl font-bold text-rose-400">
              {formatPrice(summary.this_month_expenses)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-text-muted mb-1">
              {t("account_book.this_month_net", "Net")}
            </p>
            <p
              className={`text-xl font-bold ${summary.this_month_income - summary.this_month_expenses >= 0 ? "text-emerald-500" : "text-rose-500"}`}
            >
              {summary.this_month_income - summary.this_month_expenses >= 0
                ? "+"
                : "-"}
              {formatPrice(
                Math.abs(
                  summary.this_month_income - summary.this_month_expenses,
                ),
              )}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
