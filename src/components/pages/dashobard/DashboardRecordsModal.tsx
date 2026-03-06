import { AnimatePresence, motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { DashboardDetailRecord } from "../../../types/dashboard";

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

interface DashboardRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  records: DashboardDetailRecord[];
  loading: boolean;
  formatPrice: (value: number) => string;
}

export default function DashboardRecordsModal({
  isOpen,
  onClose,
  title,
  records,
  loading,
  formatPrice,
}: DashboardRecordsModalProps) {
  const { t } = useTranslation();

  const total = records.reduce((sum, r) => sum + r.amount, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-2xl glass-panel shadow-2xl border border-glass-border flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-glass-border shrink-0">
              <h3 className="text-lg font-bold text-text-primary">{title}</h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-glass-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-5">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-10 bg-glass-white rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-text-muted">
                    {t("dashboard.no_records")}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                      <th className="pb-3 pr-3">
                        {t("dashboard.records_order_id")}
                      </th>
                      <th className="pb-3 pr-3">
                        {t("dashboard.records_customer")}
                      </th>
                      <th className="pb-3 pr-3 text-right">
                        {t("dashboard.records_amount")}
                      </th>
                      <th className="pb-3 text-right">
                        {t("dashboard.records_date")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, idx) => (
                      <tr
                        key={idx}
                        className="border-t border-glass-border/50 hover:bg-glass-white/50 transition-colors"
                      >
                        <td className="py-2.5 pr-3 font-medium text-text-primary">
                          {record.order_id || "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-text-secondary">
                          {record.customer_name || "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-text-primary">
                          {formatPrice(record.amount)}
                        </td>
                        <td className="py-2.5 text-right text-text-muted text-xs">
                          {record.order_date || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer with total */}
            {!loading && records.length > 0 && (
              <div className="flex items-center justify-between p-5 border-t border-glass-border shrink-0 bg-glass-white/30">
                <span className="text-sm font-semibold text-text-muted">
                  {t("dashboard.records_total")} ({records.length})
                </span>
                <span className="text-lg font-bold text-text-primary">
                  {formatPrice(total)}
                </span>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
