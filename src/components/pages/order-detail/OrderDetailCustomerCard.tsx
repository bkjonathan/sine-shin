import { useTranslation } from "react-i18next";
import { IconMapPin, IconPhone, IconUserRound } from "../../icons";

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
  const initial =
    customerName && customerName !== "-"
      ? customerName.trim().charAt(0).toUpperCase()
      : "?";

  return (
    <div className="glass-panel p-5">
      <h2 className="text-lg font-semibold text-text-primary mb-3">
        {t("orders.detail.customer_info")}
      </h2>
      <div className="rounded-xl border border-glass-border bg-gradient-to-br from-glass-white/10 via-glass-white/5 to-transparent p-4 hover:border-accent-blue/30 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-glass-border pb-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue flex items-center justify-center font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-text-primary truncate">
                {customerName || t("common.na", "N/A")}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                  {t("customers.id_label")}: {customerCode || "-"}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-glass-white/10 text-text-secondary border border-glass-border">
                  {customerPlatform || "-"}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-text-secondary text-xs uppercase tracking-wide">
            <IconUserRound className="w-3.5 h-3.5" strokeWidth={2} />
            {t("orders.customer")}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border border-glass-border bg-glass-white/5 p-3">
            <label className="text-[11px] uppercase tracking-wide text-text-secondary block mb-1 font-semibold">
              {t("customers.form.phone")}
            </label>
            <p className="text-sm text-text-primary font-medium flex items-center gap-2">
              <IconPhone className="w-4 h-4 text-accent-blue" strokeWidth={2} />
              {customerPhone || "-"}
            </p>
          </div>

          <div className="rounded-lg border border-glass-border bg-glass-white/5 p-3">
            <label className="text-[11px] uppercase tracking-wide text-text-secondary block mb-1 font-semibold">
              {t("customers.form.city")}
            </label>
            <p className="text-sm text-text-primary font-medium flex items-center gap-2">
              <IconMapPin
                className="w-4 h-4 text-accent-blue shrink-0"
                strokeWidth={2}
              />
              {customerCity || "-"}
            </p>
          </div>

          <div className="rounded-lg border border-glass-border bg-glass-white/5 p-3 lg:col-span-1">
            <label className="text-[11px] uppercase tracking-wide text-text-secondary block mb-1 font-semibold">
              {t("customers.form.address")}
            </label>
            <p className="text-sm text-text-primary font-medium leading-relaxed break-words">
              {customerAddress || "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
