import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { motion } from "framer-motion";
import { Button, Input } from "../../ui";
import { useSound } from "../../../context/SoundContext";
import { IconImage } from "../../icons";

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeMap[ext] || "image/png";
}

async function loadPickedFilePreview(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const mimeType = getMimeType(filePath);
  const blob = new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}

export default function SettingsAccountPanel() {
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customerIdPrefix, setCustomerIdPrefix] = useState("SSC-");
  const [orderIdPrefix, setOrderIdPrefix] = useState("SSO-");
  const [newLogoPath, setNewLogoPath] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { playSound } = useSound();
  const { t } = useTranslation();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const settings = await invoke<{
        shop_name: string;
        phone: string | null;
        address: string | null;
        logo_path: string | null;
        customer_id_prefix: string | null;
        order_id_prefix: string | null;
      }>("get_shop_settings");
      setShopName(settings.shop_name);
      setPhone(settings.phone || "");
      setAddress(settings.address || "");
      setCustomerIdPrefix(settings.customer_id_prefix || "SSC-");
      setOrderIdPrefix(settings.order_id_prefix || "SSO-");

      if (settings.logo_path) {
        setPreviewSrc(convertFileSrc(settings.logo_path));
      } else {
        setPreviewSrc(null);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setMessage({ type: "error", text: t("settings.error_load") });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
          },
        ],
      });
      if (selected) {
        setNewLogoPath(selected);
        try {
          const blobUrl = await loadPickedFilePreview(selected);
          if (previewSrc && previewSrc.startsWith("blob:")) {
            URL.revokeObjectURL(previewSrc);
          }
          setPreviewSrc(blobUrl);
        } catch (logoErr) {
          console.error("Failed to preview selected logo:", logoErr);
          setPreviewSrc(convertFileSrc(selected));
        }
      }
    } catch (err) {
      console.error("Failed to pick logo:", err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await invoke("update_shop_settings", {
        shopName,
        phone,
        address,
        logoPath: newLogoPath,
        customerIdPrefix,
        orderIdPrefix,
      });
      setMessage({
        type: "success",
        text: t("settings.account.success_message"),
      });
      playSound("success");

      setNewLogoPath(null);

      if (previewSrc && previewSrc.startsWith("blob:")) {
        URL.revokeObjectURL(previewSrc);
      }

      await fetchSettings(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setMessage({ type: "error", text: t("settings.account.error_message") });
      playSound("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-6 h-6 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      key="account"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("settings.account.title")}
        </h2>
        {message && (
          <motion.span
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs px-2 py-1 rounded-md ${
              message.type === "success"
                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
          >
            {message.text}
          </motion.span>
        )}
      </div>
      <p className="text-xs text-text-muted mb-5">
        {t("settings.account.subtitle")}
      </p>

      <div className="space-y-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-secondary">
            {t("settings.account.shop_logo")}
          </label>

          <div className="flex items-center gap-4">
            <div className="relative group w-20 h-20 rounded-full bg-glass-white border border-glass-border overflow-hidden flex items-center justify-center shrink-0">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Shop Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <IconImage
                  size={24}
                  strokeWidth={1.5}
                  className="text-text-muted"
                />
              )}
            </div>
            <Button
              onClick={handlePickLogo}
              variant="ghost"
              className="text-xs px-3 py-1.5"
            >
              {t("settings.account.change_logo")}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.shop_name")}
          </label>
          <Input
            type="text"
            className="input-liquid"
            placeholder={t("settings.account.shop_name_placeholder")}
            value={shopName}
            onChange={(event) => setShopName(event.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.phone_number")}
          </label>
          <Input
            type="tel"
            className="input-liquid"
            placeholder={t("settings.account.phone_placeholder")}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.address")}
          </label>
          <textarea
            className="input-liquid min-h-[80px] py-2"
            placeholder={t("settings.account.address_placeholder")}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.customer_id_prefix")}
          </label>
          <Input
            type="text"
            className="input-liquid font-mono uppercase"
            placeholder="SSC-"
            value={customerIdPrefix}
            onChange={(event) =>
              setCustomerIdPrefix(event.target.value.toUpperCase())
            }
          />
          <p className="text-xs text-text-muted mt-1">
            {t("settings.account.customer_id_desc")}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.order_id_prefix")}
          </label>
          <Input
            type="text"
            className="input-liquid font-mono uppercase"
            placeholder="SSO-"
            value={orderIdPrefix}
            onChange={(event) =>
              setOrderIdPrefix(event.target.value.toUpperCase())
            }
          />
          <p className="text-xs text-text-muted mt-1">
            {t("settings.account.order_id_desc")}
          </p>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            variant="primary"
            className="text-sm px-6 py-2.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            loading={saving}
            loadingText={t("settings.account.saving")}
          >
            {t("settings.account.save_changes")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
