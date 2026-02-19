import { AnimatePresence, motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../../ui";
import { IconX } from "../../icons";
import { Customer, CustomerFormData, CustomerFormErrors } from "../../../types/customer";

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

interface CustomerFormModalProps {
  isOpen: boolean;
  editingCustomer: Customer | null;
  formData: CustomerFormData;
  formErrors: CustomerFormErrors;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFieldChange: (field: keyof CustomerFormData, value: string) => void;
  onPlatformChange: (value: string) => void;
}

export default function CustomerFormModal({
  isOpen,
  editingCustomer,
  formData,
  formErrors,
  isSubmitting,
  onClose,
  onSubmit,
  onFieldChange,
  onPlatformChange,
}: CustomerFormModalProps) {
  const { t } = useTranslation();

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
            className="relative w-full max-w-lg glass-panel p-6 shadow-2xl border border-glass-border"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">
                {editingCustomer
                  ? t("customers.modal.title_edit")
                  : t("customers.modal.title_add")}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
              >
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <Input
                    label={
                      <>
                        {t("customers.form.name")} <span className="text-red-500">*</span>
                      </>
                    }
                    type="text"
                    required
                    className="w-full"
                    placeholder="John Doe"
                    value={formData.name}
                    error={formErrors.name}
                    onChange={(e) => onFieldChange("name", e.target.value)}
                  />
                </div>

                <div>
                  <Input
                    label={t("customers.form.phone")}
                    type="tel"
                    className="w-full"
                    placeholder="0912345678"
                    value={formData.phone}
                    error={formErrors.phone}
                    onChange={(e) => onFieldChange("phone", e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("customers.form.platform")}
                  </label>
                  <div className="relative z-20">
                    <Select
                      options={[
                        { value: "Facebook", label: "Facebook" },
                        { value: "TikTok", label: "TikTok" },
                        { value: "Others", label: t("common.others") },
                      ]}
                      value={formData.platform}
                      onChange={(val) => onPlatformChange(String(val))}
                      placeholder={t("customers.form.select_platform")}
                    />
                  </div>
                </div>

                <div>
                  <Input
                    label={t("customers.form.city")}
                    type="text"
                    className="w-full"
                    placeholder="Yangon"
                    value={formData.city}
                    error={formErrors.city}
                    onChange={(e) => onFieldChange("city", e.target.value)}
                  />
                </div>

                <div>
                  <Input
                    label={t("customers.form.social_url")}
                    type="text"
                    className="w-full"
                    placeholder="https://facebook.com/..."
                    value={formData.social_media_url}
                    error={formErrors.social_media_url}
                    onChange={(e) => onFieldChange("social_media_url", e.target.value)}
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("customers.form.address")}
                  </label>
                  <textarea
                    className={`input-liquid w-full min-h-[80px] ${
                      formErrors.address ? "border-red-500/50" : ""
                    }`}
                    placeholder="Full address..."
                    value={formData.address}
                    onChange={(e) => onFieldChange("address", e.target.value)}
                  />
                  {formErrors.address && (
                    <p className="mt-1 text-xs text-error" role="alert">
                      {formErrors.address}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" onClick={onClose} variant="ghost">
                  {t("customers.modal.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex items-center gap-2"
                  loading={isSubmitting}
                >
                  {editingCustomer
                    ? t("customers.modal.update")
                    : t("customers.modal.create")}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
