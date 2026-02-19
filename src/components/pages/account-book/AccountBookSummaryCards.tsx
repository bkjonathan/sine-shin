import { useTranslation } from "react-i18next";
import { AccountBookTotals } from "../../../types/accountBook";

interface AccountBookSummaryCardsProps {
  totalRows: number;
  totals: AccountBookTotals;
  formatPrice: (amount: number) => string;
}

export default function AccountBookSummaryCards({
  totalRows,
  totals,
  formatPrice,
}: AccountBookSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="glass-panel p-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {t("account_book.total_orders")}
        </p>
        <p className="text-xl font-bold text-text-primary mt-2">
          {totalRows.toLocaleString()}
        </p>
      </div>
      <div className="glass-panel p-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {t("account_book.total_sales")}
        </p>
        <p className="text-xl font-bold text-text-primary mt-2">
          {formatPrice(totals.totalSales)}
        </p>
      </div>
      <div className="glass-panel p-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {t("account_book.total_discount")}
        </p>
        <p className="text-xl font-bold text-amber-500 mt-2">
          {formatPrice(totals.totalDiscount)}
        </p>
      </div>
      <div className="glass-panel p-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {t("account_book.total_profit")}
        </p>
        <p className="text-xl font-bold text-emerald-500 mt-2">
          {formatPrice(totals.totalProfit)}
        </p>
      </div>
    </div>
  );
}
