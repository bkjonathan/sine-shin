import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { IconTrash } from "../../icons";
import {
  modalScaleVariants,
  overlayFadeMotionProps,
} from "../../../constants/animations";

interface StaffDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userName: string;
}

export default function StaffDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  userName,
}: StaffDeleteModalProps) {
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
                {t("staff.delete_title") || "Delete Staff"}
              </h3>
              <p className="text-sm text-text-muted mb-6">
                {t("staff.delete_desc") || "Are you sure you want to delete "}
                <span className="font-semibold text-text-primary">
                  "{userName}"
                </span>
                ?{t("staff.delete_warning") || " This action cannot be undone."}
              </p>
              <div className="flex gap-3 w-full">
                <Button
                  onClick={onClose}
                  variant="ghost"
                  className="flex-1 py-2.5 text-sm"
                >
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  onClick={onConfirm}
                  variant="danger"
                  className="flex-1 py-2.5 text-sm"
                >
                  {t("common.delete") || "Delete"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
