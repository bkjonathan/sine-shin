import { useTranslation } from "react-i18next";
import { formatDate } from "../../../utils/date";
import { Button } from "../../ui";
import { AccountBookRow } from "../../../types/accountBook";

interface AccountBookTableProps {
  loading: boolean;
  rows: AccountBookRow[];
  formatPrice: (amount: number) => string;
  onViewOrder: (orderId: number) => void;
}

export default function AccountBookTable({
  loading,
  rows,
  formatPrice,
  onViewOrder,
}: AccountBookTableProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="h-full flex justify-center items-center py-20">
        <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center py-20">
        <h3 className="text-lg font-semibold text-text-primary">
          {t("account_book.no_data")}
        </h3>
        <p className="text-sm text-text-muted mt-1">{t("account_book.no_data_hint")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto rounded-lg">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
          <tr>
            <th className="text-left py-3 px-3">{t("orders.date")}</th>
            <th className="text-left py-3 px-3">{t("orders.search_key_order_id")}</th>
            <th className="text-left py-3 px-3">{t("orders.customer")}</th>
            <th className="text-right py-3 px-3">{t("orders.total_price")}</th>
            <th className="text-right py-3 px-3">{t("orders.form.service_fee")}</th>
            <th className="text-right py-3 px-3">{t("orders.form.product_discount")}</th>
            <th className="text-right py-3 px-3">{t("account_book.profit")}</th>
            <th className="text-right py-3 px-3">{t("account_book.action")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-glass-border">
          {rows.map((row) => (
            <tr key={row.order.id} className="hover:bg-glass-white/40 transition-colors">
              <td className="py-3 px-3 text-text-secondary">
                {formatDate(row.order.order_date || row.order.created_at)}
              </td>
              <td className="py-3 px-3 text-text-primary font-medium">
                {row.order.order_id || row.order.id}
              </td>
              <td className="py-3 px-3 text-text-primary">
                {row.order.customer_name || "-"}
              </td>
              <td className="py-3 px-3 text-right text-text-primary">
                {formatPrice(row.order.total_price || 0)}
              </td>
              <td className="py-3 px-3 text-right text-text-primary">
                {formatPrice(row.serviceFeeAmount)}
              </td>
              <td className="py-3 px-3 text-right text-amber-500 font-medium">
                {formatPrice(row.productDiscount)}
              </td>
              <td className="py-3 px-3 text-right text-emerald-500 font-semibold">
                {formatPrice(row.profit)}
              </td>
              <td className="py-3 px-3 text-right">
                <Button
                  type="button"
                  onClick={() => onViewOrder(row.order.id)}
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                >
                  {t("account_book.view_order")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
