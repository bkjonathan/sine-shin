import { useTranslation } from "react-i18next";
import { IconExternalLink, IconPackage } from "../../icons";
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
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("orders.detail.product_details")}
        </h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-semibold">
          <IconPackage className="w-3.5 h-3.5" strokeWidth={2} />
          {items.length}
        </span>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-glass-border bg-glass-white/5 p-4 text-sm text-text-secondary">
            {t("orders.no_orders")}
          </div>
        )}

        {items.map((item, index) => {
          const qty = item.product_qty || 0;
          const price = item.price || 0;
          const weight = item.product_weight || 0;
          const lineTotal = qty * price;

          return (
            <div
              key={`${item.id}-${index}`}
              className="rounded-xl border border-glass-border bg-gradient-to-br from-glass-white/10 via-glass-white/5 to-transparent p-3.5 hover:border-accent-blue/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <span className="px-2.5 py-1 rounded-md bg-accent-blue/10 text-accent-blue text-[11px] sm:text-xs font-semibold">
                  {t("orders.detail.item_index", { index: index + 1 })}
                </span>
                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary">
                    {t("orders.total")}
                  </p>
                  <p className="text-base font-bold text-accent-blue">
                    {formatPrice(lineTotal)}
                  </p>
                </div>
              </div>

              {item.product_url && (
                <a
                  href={item.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-glass-white/5 px-2.5 py-2 text-sm text-text-secondary hover:border-accent-blue/40 hover:text-accent-blue transition-colors"
                >
                  <span className="truncate">{item.product_url}</span>
                  <IconExternalLink
                    className="w-3.5 h-3.5 shrink-0"
                    strokeWidth={2}
                  />
                </a>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-glass-border bg-glass-white/5 px-2 py-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
                    {t("orders.qty")}
                  </p>
                  <p className="text-base font-semibold text-text-primary">
                    {qty}
                  </p>
                </div>
                <div className="rounded-lg border border-glass-border bg-glass-white/5 px-2 py-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
                    {t("orders.price")}
                  </p>
                  <p className="text-base font-semibold text-text-primary">
                    {formatPrice(price)}
                  </p>
                </div>
                <div className="rounded-lg border border-glass-border bg-glass-white/5 px-2 py-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
                    {t("orders.form.weight")}
                  </p>
                  <p className="text-base font-semibold text-text-primary">
                    {weight} <span className="text-xs">kg</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-3 border-t border-glass-border grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-lg border border-glass-border bg-glass-white/5 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
              {t("orders.total_qty")}
            </p>
            <p className="text-sm sm:text-base font-bold text-text-primary">
              {order.total_qty || 0}
            </p>
          </div>
          <div className="rounded-lg border border-glass-border bg-glass-white/5 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
              {t("orders.total_price")}
            </p>
            <p className="text-sm sm:text-base font-bold text-text-primary">
              {formatPrice(order.total_price || 0)}
            </p>
          </div>
          <div className="rounded-lg border border-glass-border bg-glass-white/5 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
              {t("orders.total_weight")}
            </p>
            <p className="text-sm sm:text-base font-bold text-text-primary">
              {order.total_weight || 0}
            </p>
          </div>
          <div className="rounded-lg border border-glass-border bg-glass-white/5 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-1">
              {t("orders.form.exchange_rate")}
            </p>
            <p className="text-sm sm:text-base font-bold text-text-primary">
              {formatExchangePrice(order.exchange_rate || 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
