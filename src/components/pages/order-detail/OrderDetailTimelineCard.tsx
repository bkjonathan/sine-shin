import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OrderWithCustomer } from "../../../types/order";

interface OrderDetailTimelineCardProps {
  order: OrderWithCustomer;
  renderEditableDate: (
    label: string,
    field: string,
    value: string | undefined | null,
  ) => ReactNode;
}

export default function OrderDetailTimelineCard({
  order,
  renderEditableDate,
}: OrderDetailTimelineCardProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-4">
        {t("orders.detail.timeline")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {renderEditableDate(t("orders.form.order_date"), "order_date", order.order_date)}
        {renderEditableDate(
          t("orders.form.arrived_date"),
          "arrived_date",
          order.arrived_date,
        )}
        {renderEditableDate(
          t("orders.form.shipment_date"),
          "shipment_date",
          order.shipment_date,
        )}
        {renderEditableDate(
          t("orders.form.user_withdraw_date"),
          "user_withdraw_date",
          order.user_withdraw_date,
        )}
      </div>
    </div>
  );
}
