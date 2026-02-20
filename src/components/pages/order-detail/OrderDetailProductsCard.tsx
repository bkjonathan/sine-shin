import { useTranslation } from "react-i18next";
import { OrderItem, OrderWithCustomer } from "../../../types/order";

interface OrderDetailProductsCardProps {
  items: OrderItem[];
  order: OrderWithCustomer;
  formatPrice: (amount: number) => string;
  formatExchangePrice: (amount: number) => string;
}

export default function OrderDetailProductsCard({
  items,
  order,
  formatPrice,
  formatExchangePrice,
}: OrderDetailProductsCardProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-4">
        {t("orders.detail.product_details")}
      </h2>
      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={index}
            className="border border-glass-border rounded-xl p-4 bg-glass-white/5 hover:border-accent-blue/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-lg bg-accent-blue/10 text-accent-blue text-xs font-semibold">
                {t("orders.detail.item_index", { index: index + 1 })}
              </span>
            </div>

            {item.product_url && (
              <div className="mb-3 pb-3 border-b border-glass-border">
                <label className="text-xs uppercase tracking-wide text-text-secondary mb-1.5 block font-semibold">
                  {t("orders.product_link")}
                </label>
                <a
                  href={item.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-blue hover:underline break-all text-sm"
                >
                  {item.product_url}
                </a>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                  {t("orders.qty")}
                </label>
                <p className="text-xl font-bold text-text-primary">
                  {item.product_qty || 0}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                  {t("orders.price")}
                </label>
                <p className="text-xl font-bold text-text-primary">
                  {formatPrice(item.price || 0)}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                  {t("orders.form.weight")}
                </label>
                <p className="text-xl font-bold text-text-primary">
                  {item.product_weight || 0} <span className="text-sm">kg</span>
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-glass-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  {t("orders.total")}
                </span>
                <span className="text-xl font-bold text-accent-blue">
                  {formatPrice((item.price || 0) * (item.product_qty || 0))}
                </span>
              </div>
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-glass-border grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">
              {t("orders.total_qty")}
            </label>
            <p className="text-text-primary font-bold">{order.total_qty}</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">
              {t("orders.total_price")}
            </label>
            <p className="text-text-primary font-bold">
              {formatPrice(order.total_price || 0)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">
              {t("orders.total_weight")}
            </label>
            <p className="text-text-primary font-bold">{order.total_weight}</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">
              {t("orders.form.exchange_rate")}
            </label>
            <p className="text-text-primary font-bold">
              {formatExchangePrice(order.exchange_rate || 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
