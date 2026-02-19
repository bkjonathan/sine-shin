import { AnimatePresence, motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../../ui";
import { IconX } from "../../icons";
import { Expense, ExpenseFormData, ExpenseFormErrors } from "../../../types/expense";

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

interface ExpenseFormModalProps {
  isOpen: boolean;
  editingExpense: Expense | null;
  formData: ExpenseFormData;
  formErrors: ExpenseFormErrors;
  categoryOptions: Array<{ value: string; label: string }>;
  paymentMethodOptions: Array<{ value: string; label: string }>;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onFieldChange: (field: keyof ExpenseFormData, value: string) => void;
}

export default function ExpenseFormModal({
  isOpen,
  editingExpense,
  formData,
  formErrors,
  categoryOptions,
  paymentMethodOptions,
  isSubmitting,
  onClose,
  onSubmit,
  onFieldChange,
}: ExpenseFormModalProps) {
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
            className="relative w-full max-w-xl glass-panel p-6 shadow-2xl border border-glass-border"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">
                {editingExpense
                  ? t("expenses.modal.title_edit")
                  : t("expenses.modal.title_add")}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
              >
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                label={
                  `${t("expenses.form.title")} *`
                }
                type="text"
                required
                className="input-liquid w-full"
                placeholder={t("expenses.form.title_placeholder")}
                value={formData.title}
                error={formErrors.title}
                onChange={(event) => onFieldChange("title", event.target.value)}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={`${t("expenses.form.amount")} *`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="input-liquid w-full"
                  placeholder="0"
                  value={formData.amount}
                  error={formErrors.amount}
                  onChange={(event) => onFieldChange("amount", event.target.value)}
                />
                <Input
                  label={t("expenses.form.expense_date")}
                  type="date"
                  className="input-liquid w-full"
                  value={formData.expense_date}
                  onChange={(event) =>
                    onFieldChange("expense_date", event.target.value)
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("expenses.form.category")}
                  </label>
                  <Select
                    options={categoryOptions}
                    value={formData.category}
                    onChange={(value) => onFieldChange("category", value.toString())}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("expenses.form.payment_method")}
                  </label>
                  <Select
                    options={paymentMethodOptions}
                    value={formData.payment_method}
                    onChange={(value) =>
                      onFieldChange("payment_method", value.toString())
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t("expenses.form.notes")}
                </label>
                <textarea
                  className={`input-liquid w-full min-h-[90px] ${formErrors.notes ? "border-red-500/50" : ""}`}
                  placeholder={t("expenses.form.notes_placeholder")}
                  value={formData.notes}
                  onChange={(event) => onFieldChange("notes", event.target.value)}
                />
                {formErrors.notes && (
                  <p className="mt-1 text-xs text-error" role="alert">
                    {formErrors.notes}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" onClick={onClose} variant="ghost">
                  {t("expenses.modal.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex items-center gap-2"
                  loading={isSubmitting}
                >
                  {editingExpense
                    ? t("expenses.modal.update")
                    : t("expenses.modal.create")}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
