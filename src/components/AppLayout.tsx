import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSound } from "../context/SoundContext";
import { useTranslation } from "react-i18next";
import {
  IconBookOpen,
  IconChartColumn,
  IconHome,
  IconList,
  IconMinus,
  IconSettings,
  IconSquare,
  IconUsers,
  IconWallet,
  IconX,
} from "./icons";

const navItems = [
  { to: "/dashboard", label: "nav.dashboard", icon: IconHome },
  { to: "/customers", label: "nav.customers", icon: IconUsers },
  { to: "/orders", label: "nav.orders", icon: IconList },
  { to: "/expenses", label: "nav.expenses", icon: IconWallet },
  { to: "/account-book", label: "nav.account_book", icon: IconBookOpen },
  { to: "/reports", label: "nav.reports", icon: IconChartColumn },
  { to: "/settings", label: "nav.settings", icon: IconSettings },
];

export default function AppLayout() {
  const [platform] = useState(() => {
    // Detect platform: macOS has traffic lights handled by Tauri overlay
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macos";
    return "windows";
  });

  const appWindow = getCurrentWindow();
  const { playSound } = useSound();
  const { t } = useTranslation();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Liquid Gradient Background (Bottom Layer) ── */}
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>

      {/* ── Sidebar (Middle Layer) ── */}
      <aside
        className="glass-sidebar relative z-10 flex flex-col"
        style={{
          width: "var(--sidebar-width)",
          minWidth: "var(--sidebar-width)",
        }}
      >
        {/* Drag region / traffic light spacing */}
        <div
          className="drag-region shrink-0"
          data-tauri-drag-region
          onMouseDown={(e) => {
            if (e.button === 0 && e.detail === 1) {
              e.preventDefault();
              appWindow.startDragging();
            }
          }}
          onDoubleClick={() => appWindow.toggleMaximize()}
          style={{
            height: platform === "macos" ? "52px" : "var(--titlebar-height)",
            paddingTop: platform === "macos" ? "12px" : "0",
          }}
        >
          {/* On macOS, traffic lights are rendered by the OS in the overlay area */}
        </div>

        {/* App branding */}
        <div className="px-5 pb-4">
          <h1 className="text-lg font-bold text-text-primary tracking-tight">
            {t("app.title")}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">{t("app.subtitle")}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
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

        {/* Bottom section */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-accent-blue to-accent-purple flex items-center justify-center text-xs font-bold text-white">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {t("nav.admin")}
              </p>
              <p className="text-xs text-text-muted truncate">
                {t("nav.owner")}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area (Top Layer) ── */}
      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {/* Title bar / drag region */}
        <div
          className="drag-region shrink-0 flex items-center justify-end"
          data-tauri-drag-region
          onMouseDown={(e) => {
            // Only drag if clicking on the bar itself, not on child buttons
            if (
              e.target === e.currentTarget &&
              e.button === 0 &&
              e.detail === 1
            ) {
              e.preventDefault();
              appWindow.startDragging();
            }
          }}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) appWindow.toggleMaximize();
          }}
          style={{ height: "var(--titlebar-height)" }}
        >
          {/* Windows-style window controls */}
          {platform === "windows" && (
            <div className="no-drag flex items-center h-full">
              <button
                onClick={() => appWindow.minimize()}
                className="h-full px-4 hover:bg-white/10 transition-colors flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <IconMinus size={12} strokeWidth={1.6} />
              </button>
              <button
                onClick={() => appWindow.toggleMaximize()}
                className="h-full px-4 hover:bg-white/10 transition-colors flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <IconSquare size={12} strokeWidth={1.3} />
              </button>
              <button
                onClick={() => appWindow.close()}
                className="h-full px-4 hover:bg-red-500/80 transition-colors flex items-center justify-center text-text-muted hover:text-white"
              >
                <IconX size={12} strokeWidth={1.6} />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
