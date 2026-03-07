import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { IconTrash } from "../../icons";
import { OrderWithCustomer } from "../../../types/order";
import {
  modalScaleVariants,
  overlayFadeMotionProps,
} from "../../../constants/animations";

interface OrderDeleteModalProps {
  isOpen: boolean;
  order: OrderWithCustomer | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function OrderDeleteModal({
  isOpen,
  order,
  onClose,
  onConfirm,
}: OrderDeleteModalProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            {...overlayFadeMotionProps}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            variants={modalScaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-sm glass-panel p-6 shadow-2xl border border-glass-border"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                <IconTrash size={24} strokeWidth={2} />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t("orders.delete_modal.title")}
              </h3>
              <p className="text-sm text-text-muted mb-1">{order?.order_id || "-"}</p>
              <p className="text-sm text-text-muted mb-6">
                {t("orders.delete_modal.message")}
              </p>
              <div className="flex gap-3 w-full">
                <Button
                  onClick={onClose}
                  variant="ghost"
                  className="flex-1 py-2.5 text-sm"
                >
                  {t("orders.modal.cancel")}
                </Button>
                <Button
                  onClick={onConfirm}
                  variant="danger"
                  className="flex-1 py-2.5 text-sm"
                >
                  {t("orders.delete_modal.delete")}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
