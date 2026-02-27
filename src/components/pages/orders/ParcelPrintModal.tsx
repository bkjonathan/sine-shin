import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../ui";
import { OrderWithCustomer } from "../../../types/order";
import { IconPrinter, IconX } from "../../icons";
import { ParcelPrintOptions } from "./ParcelPrintLayout";

interface ParcelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: OrderWithCustomer[];
  onPrint: (options: ParcelPrintOptions) => Promise<void>;
}

export default function ParcelPrintModal({
  isOpen,
  onClose,
  selectedOrders,
  onPrint,
}: ParcelPrintModalProps) {
  const { t } = useTranslation();
  const [isPrinting, setIsPrinting] = useState(false);

  const [options, setOptions] = useState<ParcelPrintOptions>({
    showCustomerName: true,
    showCustomerId: false,
    showCustomerPhone: true,
    showCustomerAddress: true,
    showProductDetails: true,
    showOrderId: true,
    showShopName: true,
  });

  const handleOptionChange = (key: keyof ParcelPrintOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrintClick = async () => {
    try {
      setIsPrinting(true);
      await onPrint(options);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPrinting(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-glass-panel border border-glass-border rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-glass-border">
            <h2 className="text-xl font-bold text-text-primary">
              Print Parcels
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-glass-white-hover rounded-lg transition-colors"
            >
              <IconX size={20} strokeWidth={2} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[70vh]">
            <p className="text-text-secondary mb-6">
              You selected{" "}
              <strong className="text-text-primary">
                {selectedOrders.length}
              </strong>{" "}
              orders. Configure what to include on the parcel labels below:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showCustomerName}
                  onChange={() => handleOptionChange("showCustomerName")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Customer Name
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showCustomerId}
                  onChange={() => handleOptionChange("showCustomerId")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Customer ID
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showCustomerPhone}
                  onChange={() => handleOptionChange("showCustomerPhone")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Customer Phone
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showCustomerAddress}
                  onChange={() => handleOptionChange("showCustomerAddress")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Customer Address
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showProductDetails}
                  onChange={() => handleOptionChange("showProductDetails")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Product Details
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showOrderId}
                  onChange={() => handleOptionChange("showOrderId")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Order ID
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-glass-border hover:bg-glass-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={options.showShopName}
                  onChange={() => handleOptionChange("showShopName")}
                  className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                />
                <span className="text-sm text-text-primary font-medium">
                  Shop Name
                </span>
              </label>
            </div>
          </div>

          <div className="p-4 border-t border-glass-border flex justify-end gap-3 bg-glass-white/5">
            <Button variant="default" onClick={onClose} disabled={isPrinting}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handlePrintClick}
              disabled={isPrinting || selectedOrders.length === 0}
              className="flex items-center gap-2"
            >
              {isPrinting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <IconPrinter size={18} strokeWidth={2} />
              )}
              {isPrinting ? "Printing..." : "Print Labels"}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
