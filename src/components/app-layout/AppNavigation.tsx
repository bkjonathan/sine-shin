import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSound } from "../../context/SoundContext";
import {
  IconBookOpen,
  IconChartColumn,
  IconHome,
  IconList,
  IconSettings,
  IconUsers,
  IconWallet,
} from "../icons";

const navItems = [
  { to: "/dashboard", label: "nav.dashboard", icon: IconHome },
  { to: "/customers", label: "nav.customers", icon: IconUsers },
  { to: "/orders", label: "nav.orders", icon: IconList },
  { to: "/expenses", label: "nav.expenses", icon: IconWallet },
  { to: "/account-book", label: "nav.account_book", icon: IconBookOpen },
  { to: "/reports", label: "nav.reports", icon: IconChartColumn },
  { to: "/settings", label: "nav.settings", icon: IconSettings },
];

export default function AppNavigation() {
  const { playSound } = useSound();
  const { t } = useTranslation();

  return (
    <nav className="flex-1 px-3 space-y-1">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => playSound("click")}
          className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
        >
          <Icon size={20} strokeWidth={1.8} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
