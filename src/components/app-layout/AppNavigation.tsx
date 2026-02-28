import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSyncConfig, SyncConfig } from "../../api/syncApi";
import { useSound } from "../../context/SoundContext";
import {
  IconBookOpen,
  IconChartColumn,
  IconHome,
  IconHelpCircle,
  IconList,
  IconSettings,
  IconUsers,
} from "../icons";

export default function AppNavigation() {
  const { playSound } = useSound();
  const { t } = useTranslation();
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);

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
      {menuItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => playSound("click")}
          className={({ isActive }) =>
            `nav-item ${isActive ? "nav-item-active" : ""}`
          }
        >
          <Icon size={20} strokeWidth={1.8} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
