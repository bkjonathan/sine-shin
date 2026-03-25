import { useTranslation } from "react-i18next";
import { formatDate } from "../../../utils/date";
import { Button } from "../../ui";
import { AccountBookRow } from "../../../types/accountBook";
import { OrderStatus } from "../../../types/order";

interface AccountBookTableProps {
  loading: boolean;
  rows: AccountBookRow[];
  formatPrice: (amount: number) => string;
  onViewOrder: (orderId: string) => void;
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
        <p className="text-sm text-text-muted mt-1">
          {t("account_book.no_data_hint")}
        </p>
      </div>
    );
  }

  const getOrderStatusDisplay = (
    status?: OrderStatus,
  ): { labelKey: string; className: string } => {
    switch (status) {
      case "pending":
        return {
          labelKey: "orders.status_pending",
          className:
            "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
        };
      case "confirmed":
        return {
          labelKey: "orders.status_confirmed",
          className: "bg-sky-500/10 text-sky-500 border border-sky-500/20",
        };
      case "shipping":
        return {
          labelKey: "orders.status_shipping",
          className:
            "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20",
        };
      case "completed":
        return {
          labelKey: "orders.status_completed",
          className:
            "bg-green-500/10 text-green-500 border border-green-500/20",
        };
      case "cancelled":
        return {
          labelKey: "orders.status_cancelled",
          className: "bg-red-500/10 text-red-500 border border-red-500/20",
        };
      default:
        return {
          labelKey: "orders.status_unknown",
          className:
            "bg-glass-white text-text-secondary border border-glass-border",
        };
    }
  };

  return (
    <div className="h-full overflow-auto rounded-lg">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
          <tr>
            <th className="text-left py-3 px-3 w-32">{t("orders.date")}</th>
            <th className="text-left py-3 px-3 w-28">{t("orders.status")}</th>
            <th className="text-left py-3 px-3 w-32">
              {t("orders.search_key_order_id")}
            </th>
            <th className="text-left py-3 px-3">{t("orders.customer")}</th>
            <th className="text-right py-3 px-3 w-28">
              {t("orders.total_price")}
            </th>
            <th className="text-right py-3 px-3">
              {t("orders.form.service_fee")}
            </th>
            <th className="text-right py-3 px-3">
              {t("orders.form.product_discount")}
            </th>
            <th className="text-right py-3 px-3">
              {t("orders.form.cargo_fee")}
            </th>
            <th className="text-right py-3 px-3">{t("account_book.profit")}</th>
            <th className="text-right py-3 px-3">{t("account_book.action")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-glass-border">
          {rows.map((row) => {
            const statusDisplay = getOrderStatusDisplay(
              row.order.status as OrderStatus | undefined,
            );

            return (
              <tr
                key={row.order.id}
                className="hover:bg-glass-white/40 transition-colors"
              >
                <td className="py-3 px-3 text-text-secondary">
                  {formatDate(row.order.order_date || row.order.created_at)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${statusDisplay.className}`}
                  >
                    {t(statusDisplay.labelKey)}
                  </span>
                </td>
                <td className="py-3 px-3 text-text-primary font-medium">
                  {row.order.order_id || row.order.id}
                </td>
                <td className="py-3 px-3 text-text-primary">
                  <div>{row.order.customer_name || "-"}</div>
                  {row.order.order_from && (
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
                      {row.order.order_from}
                    </div>
                  )}
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
                <td className="py-3 px-3 text-right text-cyan-500 font-medium whitespace-nowrap">
                  {row.order.exclude_cargo_fee && row.order.cargo_fee ? (
                    <span className="text-rose-500/50 line-through mr-2 text-xs font-normal">
                      {formatPrice(row.order.cargo_fee)}
                    </span>
                  ) : null}
                  {formatPrice(row.cargoFee)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
