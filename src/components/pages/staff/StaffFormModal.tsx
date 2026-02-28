import { useState, useEffect } from "react";
import { AnimatePresence, motion, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../../ui";
import { IconX } from "../../icons";
import {
  StaffUser,
  createStaffUser,
  updateStaffUser,
} from "../../../api/staffApi";
import { useSound } from "../../../context/SoundContext";

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

interface StaffFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingUser: StaffUser | null;
}

export default function StaffFormModal({
  isOpen,
  onClose,
  onSaved,
  editingUser,
}: StaffFormModalProps) {
  const { t } = useTranslation();
  const { playSound } = useSound();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Pattern");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setEmail(editingUser.email || "");
        setName(editingUser.user_metadata?.name || "");
        setRole(editingUser.user_metadata?.role || "Pattern");
        setPassword("");
      } else {
        setEmail("");
        setName("");
        setRole("Pattern");
        setPassword("");
      }
      setError(null);
    }
  }, [isOpen, editingUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) {
      setError("Email and Name are required");
      return;
    }

    if (!editingUser && !password) {
      setError("Password is required for new users");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const metadata = { name, role };

      if (editingUser) {
        await updateStaffUser(editingUser.id, email, password, metadata);
      } else {
        await createStaffUser(email, password, metadata);
      }
      playSound("success");
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.toString() || "An error occurred");
      playSound("error");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            className="relative w-full max-w-md glass-panel p-6 shadow-2xl border border-glass-border"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">
                {editingUser
                  ? t("staff.edit_staff") || "Edit Staff"
                  : t("staff.add_staff") || "Add Staff"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
              >
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="p-3 bg-system-error/10 border border-system-error/20 rounded-lg text-system-error text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <Input
                  label={t("staff.name") || "Name"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="input-liquid w-full"
                  autoFocus
                />

                <Input
                  label={t("staff.email") || "Email"}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                  required
                  className="input-liquid w-full"
                />

                <Input
                  label={
                    editingUser
                      ? t("staff.password_optional") ||
                        "Password (leave blank to keep current)"
                      : t("staff.password") || "Password"
                  }
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required={!editingUser}
                  className="input-liquid w-full"
                />

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("staff.role") || "Stage Role"}
                  </label>
                  <Select
                    options={[
                      {
                        value: "Pattern",
                        label: t("staff.roles.pattern") || "Pattern",
                      },
                      {
                        value: "Cutting",
                        label: t("staff.roles.cutting") || "Cutting",
                      },
                      {
                        value: "Sewing",
                        label: t("staff.roles.sewing") || "Sewing",
                      },
                      {
                        value: "Admin",
                        label: t("staff.roles.admin") || "Admin",
                      },
                    ]}
                    value={role}
                    onChange={(val) => setRole(val as string)}
                  />
                  <p className="text-xs text-text-muted mt-1">
                    {t("staff.role_desc") ||
                      "Select the stage role for manufacturing progression."}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-glass-border">
                <Button type="button" variant="ghost" onClick={onClose}>
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  className="min-w-[100px]"
                >
                  {editingUser
                    ? t("common.save") || "Save"
                    : t("common.create") || "Create"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
