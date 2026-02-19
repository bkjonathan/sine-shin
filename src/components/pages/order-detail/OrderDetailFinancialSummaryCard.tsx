import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OrderWithCustomer } from "../../../types/order";

interface OrderDetailFinancialSummaryCardProps {
  order: OrderWithCustomer;
  orderTotal: number;
  orderProfit: number;
  totalWithExchange: number;
  formatPrice: (amount: number) => string;
  formatExchangePrice: (amount: number) => string;
  renderEditableFee: (
    label: string,
    field: string,
    value: number | undefined | null,
    suffix?: string,
    feePaidField?: string,
    isPaid?: boolean,
  ) => ReactNode;
}

export default function OrderDetailFinancialSummaryCard({
  order,
  orderTotal,
  orderProfit,
  totalWithExchange,
  formatPrice,
  formatExchangePrice,
  renderEditableFee,
}: OrderDetailFinancialSummaryCardProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-4">
        {t("orders.detail.financial_summary")}
      </h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-glass-border">
          <span className="text-text-secondary">{t("orders.total_price")}</span>
          <span className="text-text-primary">{formatPrice(order.total_price || 0)}</span>
        </div>
        {renderEditableFee(
          t("orders.form.service_fee"),
          "service_fee",
          order.service_fee,
          order.service_fee_type === "percent" ? "%" : undefined,
          "service_fee_paid",
          !!order.service_fee_paid,
        )}
        {renderEditableFee(
          t("orders.form.shipping_fee"),
          "shipping_fee",
          order.shipping_fee,
          undefined,
          "shipping_fee_paid",
          !!order.shipping_fee_paid,
        )}
        {renderEditableFee(
          t("orders.form.delivery_fee"),
          "delivery_fee",
          order.delivery_fee,
          undefined,
          "delivery_fee_paid",
          !!order.delivery_fee_paid,
        )}
        {renderEditableFee(
          t("orders.form.cargo_fee"),
          "cargo_fee",
          order.cargo_fee,
          undefined,
          "cargo_fee_paid",
          !!order.cargo_fee_paid,
        )}
        {renderEditableFee(
          t("orders.form.product_discount"),
          "product_discount",
          order.product_discount,
        )}
        <div className="mt-4 pt-4 flex justify-between items-center">
          <span className="font-semibold text-text-primary">{t("orders.total")}</span>
          <span className="font-bold text-xl text-success">{formatPrice(orderTotal)}</span>
        </div>
        <div className="pt-3 mt-2 border-t border-glass-border flex justify-between items-center">
          <span className="font-semibold text-text-primary">{t("orders.detail.profit")}</span>
          <span className="font-bold text-xl text-emerald-500">
            {formatPrice(orderProfit)}
          </span>
        </div>
        <div className="pt-3 mt-2 border-t border-glass-border flex justify-between items-center">
          <span className="font-semibold text-text-primary">
            {t("orders.invoice.total_with_exchange")}
          </span>
          <span className="font-bold text-xl text-accent-blue">
            {formatExchangePrice(totalWithExchange)}
          </span>
        </div>
      </div>
    </div>
  );
}
