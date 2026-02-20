import { useTranslation } from "react-i18next";
import { IconMapPin, IconPhone } from "../../icons";

interface OrderDetailCustomerCardProps {
  customerName: string;
  customerCode: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  customerPlatform: string;
}

export default function OrderDetailCustomerCard({
  customerName,
  customerCode,
  customerPhone,
  customerCity,
  customerAddress,
  customerPlatform,
}: OrderDetailCustomerCardProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-4">
        {t("orders.detail.customer_info")}
      </h2>
      <div className="border border-glass-border rounded-xl p-6 bg-glass-white/5 hover:border-accent-blue/30 transition-colors">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-glass-border gap-4">
          <div>
            <h3 className="text-xl font-bold text-text-primary">
              {customerName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                {t("customers.id_label")}: {customerCode}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-glass-white/10 text-text-secondary border border-glass-border">
                {customerPlatform}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                {t("customers.form.phone")}
              </label>
              <p className="text-text-primary font-medium flex items-center gap-2">
                <IconPhone
                  className="w-4 h-4 text-accent-blue"
                  strokeWidth={2}
                />
                {customerPhone}
              </p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                {t("customers.form.city")}
              </label>
              <p className="text-text-primary font-medium flex items-center gap-2">
                <IconMapPin
                  className="w-4 h-4 text-accent-blue"
                  strokeWidth={2}
                />
                {customerCity}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
              {t("customers.form.address")}
            </label>
            <p className="text-text-primary font-medium leading-relaxed bg-glass-white/5 p-3 rounded-lg border border-glass-border min-h-[80px]">
              {customerAddress}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
