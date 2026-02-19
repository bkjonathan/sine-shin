import { AnimatePresence, motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../../ui";
import { IconPlus, IconX } from "../../icons";
import {
  OrderFormData,
  OrderFormErrors,
  OrderFormItemData,
  OrderStatus,
  OrderWithCustomer,
} from "../../../types/order";
import { Customer } from "../../../types/customer";

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

interface OrderFormModalProps {
  isOpen: boolean;
  editingOrder: OrderWithCustomer | null;
  customers: Customer[];
  formData: OrderFormData;
  formErrors: OrderFormErrors;
  isSubmitting: boolean;
  statusOptions: Array<{ value: OrderStatus; labelKey: string }>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFieldChange: (field: keyof OrderFormData, value: string) => void;
  onItemChange: (index: number, field: keyof OrderFormItemData, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}

const DATE_PLACEHOLDER = "dd/mm/yyyy";

export default function OrderFormModal({
  isOpen,
  editingOrder,
  customers,
  formData,
  formErrors,
  isSubmitting,
  statusOptions,
  onClose,
  onSubmit,
  onFieldChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: OrderFormModalProps) {
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
            className="relative w-full max-w-4xl glass-panel p-6 shadow-2xl border border-glass-border max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">
                {editingOrder
                  ? t("orders.modal.title_edit")
                  : t("orders.modal.title_add")}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
              >
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-6" autoComplete="off">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                  {t("orders.modal.basic_info")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Select
                      label={t("orders.form.customer")}
                      required
                      options={customers.map((customer) => ({
                        value: customer.id,
                        label: `${customer.name} (${customer.customer_id})`,
                      }))}
                      value={formData.customer_id ? parseInt(formData.customer_id, 10) : ""}
                      onChange={(value) => onFieldChange("customer_id", String(value))}
                      placeholder={t("orders.form.select_customer")}
                    />
                    {formErrors.customer_id && (
                      <p className="mt-1 text-xs text-error" role="alert">
                        {formErrors.customer_id}
                      </p>
                    )}
                  </div>
                  <Select
                    label={t("orders.form.order_from")}
                    options={[
                      { value: "Facebook", label: "Facebook" },
                      { value: "TikTok", label: "TikTok" },
                      { value: "Others", label: t("common.others") },
                    ]}
                    value={formData.order_from}
                    onChange={(value) => onFieldChange("order_from", String(value))}
                  />
                  <Select
                    label={t("orders.form.status")}
                    options={statusOptions.map((statusOption) => ({
                      value: statusOption.value,
                      label: t(statusOption.labelKey),
                    }))}
                    value={formData.status}
                    onChange={(value) => onFieldChange("status", String(value))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label={t("orders.form.exchange_rate")}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-liquid w-full"
                    value={formData.exchange_rate}
                    error={formErrors.exchange_rate}
                    onChange={(e) => onFieldChange("exchange_rate", e.target.value)}
                  />
                  <Input
                    label={t("orders.form.order_date")}
                    type={formData.order_date ? "date" : "text"}
                    className="input-liquid w-full"
                    autoComplete="off"
                    placeholder={DATE_PLACEHOLDER}
                    value={formData.order_date}
                    onFocus={(e) => (e.target.type = "date")}
                    onBlur={(e) => {
                      if (!e.target.value) {
                        e.target.type = "text";
                      }
                    }}
                    onChange={(e) => onFieldChange("order_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-glass-border pb-1">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t("orders.modal.product_details")}
                  </h3>
                  <button
                    type="button"
                    onClick={onAddItem}
                    className="text-xs flex items-center gap-1 text-accent-blue hover:text-accent-blue-hover transition-colors"
                  >
                    <IconPlus size={14} strokeWidth={2} />
                    {t("orders.form.add_item")}
                  </button>
                </div>

                {formErrors.items && (
                  <p className="text-xs text-error" role="alert">
                    {formErrors.items}
                  </p>
                )}

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {formData.items.map((item, index) => {
                    const itemError = formErrors.itemErrors?.[index];

                    return (
                      <div
                        key={index}
                        className="p-4 bg-glass-white/30 rounded-lg border border-glass-border relative group"
                      >
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onRemoveItem(index)}
                            className="absolute top-2 right-2 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                            title={t("common.delete")}
                          >
                            <IconX size={16} strokeWidth={2} />
                          </button>
                        )}

                        <div className="space-y-3">
                          <Input
                            label={t("orders.form.product_url")}
                            type="text"
                            className="input-liquid w-full text-sm py-1.5"
                            value={item.product_url}
                            error={itemError?.product_url}
                            onChange={(e) => onItemChange(index, "product_url", e.target.value)}
                            placeholder="https://..."
                          />

                          <div className="grid grid-cols-3 gap-3">
                            <Input
                              label={t("orders.qty")}
                              type="number"
                              min="1"
                              className="input-liquid w-full text-sm py-1.5"
                              value={String(item.product_qty)}
                              error={itemError?.product_qty}
                              onChange={(e) =>
                                onItemChange(index, "product_qty", e.target.value)
                              }
                            />
                            <Input
                              label={t("orders.price")}
                              type="number"
                              min="0"
                              step="0.01"
                              className="input-liquid w-full text-sm py-1.5"
                              value={String(item.price)}
                              error={itemError?.price}
                              onChange={(e) => onItemChange(index, "price", e.target.value)}
                            />
                            <Input
                              label={t("orders.form.weight")}
                              type="number"
                              min="0"
                              step="0.01"
                              className="input-liquid w-full text-sm py-1.5"
                              value={String(item.product_weight)}
                              error={itemError?.product_weight}
                              onChange={(e) =>
                                onItemChange(index, "product_weight", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                  {t("orders.modal.fees")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("orders.form.service_fee_label")}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.service_fee}
                        error={formErrors.service_fee}
                        onChange={(e) => onFieldChange("service_fee", e.target.value)}
                      />
                      <Select
                        className="w-24"
                        value={formData.service_fee_type}
                        options={[
                          { value: "fixed", label: t("orders.form.fixed") },
                          { value: "percent", label: "%" },
                        ]}
                        onChange={(value) =>
                          onFieldChange("service_fee_type", String(value))
                        }
                      />
                    </div>
                  </div>
                  <Input
                    label={t("orders.form.product_discount")}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-liquid w-full"
                    value={formData.product_discount}
                    error={formErrors.product_discount}
                    onChange={(e) => onFieldChange("product_discount", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label={t("orders.form.shipping_fee")}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-liquid w-full"
                    value={formData.shipping_fee}
                    error={formErrors.shipping_fee}
                    onChange={(e) => onFieldChange("shipping_fee", e.target.value)}
                  />
                  <Input
                    label={t("orders.form.delivery_fee")}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-liquid w-full"
                    value={formData.delivery_fee}
                    error={formErrors.delivery_fee}
                    onChange={(e) => onFieldChange("delivery_fee", e.target.value)}
                  />
                  <Input
                    label={t("orders.form.cargo_fee")}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-liquid w-full"
                    value={formData.cargo_fee}
                    error={formErrors.cargo_fee}
                    onChange={(e) => onFieldChange("cargo_fee", e.target.value)}
                  />
                </div>
              </div>

              {editingOrder && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                    {t("orders.modal.status_dates")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                      label={t("orders.form.arrived_date")}
                      type={formData.arrived_date ? "date" : "text"}
                      className="input-liquid w-full"
                      autoComplete="off"
                      placeholder={DATE_PLACEHOLDER}
                      value={formData.arrived_date}
                      onFocus={(e) => (e.target.type = "date")}
                      onBlur={(e) => {
                        if (!e.target.value) {
                          e.target.type = "text";
                        }
                      }}
                      onChange={(e) => onFieldChange("arrived_date", e.target.value)}
                    />
                    <Input
                      label={t("orders.form.shipment_date")}
                      type={formData.shipment_date ? "date" : "text"}
                      className="input-liquid w-full"
                      autoComplete="off"
                      placeholder={DATE_PLACEHOLDER}
                      value={formData.shipment_date}
                      onFocus={(e) => (e.target.type = "date")}
                      onBlur={(e) => {
                        if (!e.target.value) {
                          e.target.type = "text";
                        }
                      }}
                      onChange={(e) => onFieldChange("shipment_date", e.target.value)}
                    />
                    <Input
                      label={t("orders.form.user_withdraw_date")}
                      type={formData.user_withdraw_date ? "date" : "text"}
                      className="input-liquid w-full"
                      autoComplete="off"
                      placeholder={DATE_PLACEHOLDER}
                      value={formData.user_withdraw_date}
                      onFocus={(e) => (e.target.type = "date")}
                      onBlur={(e) => {
                        if (!e.target.value) {
                          e.target.type = "text";
                        }
                      }}
                      onChange={(e) =>
                        onFieldChange("user_withdraw_date", e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-glass-border">
                <Button type="button" onClick={onClose} variant="ghost">
                  {t("orders.modal.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex items-center gap-2"
                  loading={isSubmitting}
                >
                  {editingOrder
                    ? t("orders.modal.update")
                    : t("orders.modal.create")}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
