import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { IconArrowLeft, IconDownload, IconPrinter } from "../../icons";
import { formatDate } from "../../../utils/date";

interface OrderDetailHeaderProps {
  orderDisplayId: string | number;
  createdAt?: string | null;
  downloading: boolean;
  printing: boolean;
  onBack: () => void;
  onDownloadInvoice: () => void;
  onPrintInvoice: () => void;
}

export default function OrderDetailHeader({
  orderDisplayId,
  createdAt,
  downloading,
  printing,
  onBack,
  onDownloadInvoice,
  onPrintInvoice,
}: OrderDetailHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-glass-white-hover transition-colors text-text-secondary hover:text-text-primary"
        >
          <IconArrowLeft size={24} strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t("orders.detail.title")} #{orderDisplayId}
          </h1>
          <p className="text-text-secondary">
            {t("orders.detail.created_at", {
              date: formatDate(createdAt),
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <Button
          onClick={onDownloadInvoice}
          variant="primary"
          className="flex items-center gap-2"
          loading={downloading}
          loadingText={t("orders.invoice.generating")}
        >
          {!downloading && <IconDownload size={18} strokeWidth={2} />}
          {t("orders.invoice.download")}
        </Button>
        <Button
          onClick={onPrintInvoice}
          className="flex items-center gap-2"
          loading={printing}
          loadingText={t("orders.invoice.generating")}
        >
          {!printing && <IconPrinter size={18} strokeWidth={2} />}
          {t("orders.invoice.print")}
        </Button>
      </div>
    </div>
  );
}
