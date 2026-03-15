import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSyncConfig, type SyncConfig } from "../../api/syncApi";
import { useTabStore } from "../../stores/tabStore";
import { isNavigationItemActive } from "../../utils/tabRoutes";
import { useSound } from "../../context/SoundContext";
import {
  IconBookOpen,
  IconChartColumn,
  IconHelpCircle,
  IconHome,
  IconList,
  IconPrinter,
  IconSettings,
  IconUsers,
} from "../icons";

export default function AppNavigation() {
  const { playSound } = useSound();
  const { t } = useTranslation();
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);

  const openTab = useTabStore((state) => state.openTab);
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);

  const activeTabPath = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId)?.path ?? "/dashboard";
  }, [activeTabId, tabs]);

  useEffect(() => {
    getSyncConfig()
      .then((config) => {
        setSyncConfig(config);
      })
      .catch(console.error);
  }, []);

  const showStaff =
    syncConfig &&
    syncConfig.sync_enabled &&
    syncConfig.supabase_url &&
    syncConfig.supabase_service_key;

  const menuItems = [
    { to: "/dashboard", label: "nav.dashboard", icon: IconHome },
    { to: "/customers", label: "nav.customers", icon: IconUsers },
    { to: "/orders", label: "nav.orders", icon: IconList },
    { to: "/label-print", label: "nav.label_print", icon: IconPrinter },
    { to: "/account-book", label: "nav.account_book", icon: IconBookOpen },
    { to: "/reports", label: "nav.reports", icon: IconChartColumn },
    ...(showStaff
      ? [{ to: "/staff", label: "nav.staff", icon: IconUsers }]
      : []),
    { to: "/settings", label: "nav.settings", icon: IconSettings },
    { to: "/help", label: "nav.help", icon: IconHelpCircle },
  ];

  return (
    <nav className="flex-1 px-3 space-y-1">
      {menuItems.map(({ to, label, icon: Icon }) => {
        const isActive = isNavigationItemActive(to, activeTabPath);

        return (
          <button
            key={to}
            type="button"
            onClick={() => {
              playSound("click");
              openTab(to, t(label));
            }}
            className={`nav-item w-full text-left ${isActive ? "nav-item-active" : ""}`}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{t(label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
