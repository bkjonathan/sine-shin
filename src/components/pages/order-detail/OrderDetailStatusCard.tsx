import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OrderStatus } from "../../../types/order";

interface OrderDetailStatusCardProps {
  status: OrderStatus | undefined;
  renderEditableStatus: (
    label: string,
    field: "status",
    value: OrderStatus | undefined,
  ) => ReactNode;
}

export default function OrderDetailStatusCard({
  status,
  renderEditableStatus,
}: OrderDetailStatusCardProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6 relative z-20">
      <h2 className="text-lg font-semibold text-text-primary mb-4">
        {t("orders.form.status")}
      </h2>
      {renderEditableStatus("", "status", status)}
    </div>
  );
}
