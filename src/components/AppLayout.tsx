import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ── SVG Icons ──
const Icons = {
  Home: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  List: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Users: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Settings: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Minimize: () => (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
    </svg>
  ),
  Maximize: () => (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect
        x="1.5"
        y="1.5"
        width="9"
        height="9"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  ),
  Close: () => (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: Icons.Home },
  { to: "/orders", label: "Orders", icon: Icons.List },
  { to: "/customers", label: "Customers", icon: Icons.Users },
  { to: "/settings", label: "Settings", icon: Icons.Settings },
];

export default function AppLayout() {
  const [platform] = useState(() => {
    // Detect platform: macOS has traffic lights handled by Tauri overlay
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macos";
    return "windows";
  });

  const appWindow = getCurrentWindow();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-liquid-bg)]">
      {/* ── Liquid Gradient Background (Bottom Layer) ── */}
      <div className="liquid-gradient">
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
          style={{
            height: platform === "macos" ? "52px" : "var(--titlebar-height)",
            paddingTop: platform === "macos" ? "12px" : "0",
          }}
        >
          {/* On macOS, traffic lights are rendered by the OS in the overlay area */}
        </div>

        {/* App branding */}
        <div className="px-5 pb-4">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
            Sine Shin
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Shop Management
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "nav-item-active" : ""}`
              }
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-purple)] flex items-center justify-center text-xs font-bold text-white">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                Admin
              </p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">
                Owner
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
          style={{ height: "var(--titlebar-height)" }}
        >
          {/* Windows-style window controls */}
          {platform === "windows" && (
            <div className="no-drag flex items-center h-full">
              <button
                onClick={() => appWindow.minimize()}
                className="h-full px-4 hover:bg-white/10 transition-colors flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <Icons.Minimize />
              </button>
              <button
                onClick={() => appWindow.toggleMaximize()}
                className="h-full px-4 hover:bg-white/10 transition-colors flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <Icons.Maximize />
              </button>
              <button
                onClick={() => appWindow.close()}
                className="h-full px-4 hover:bg-red-500/80 transition-colors flex items-center justify-center text-[var(--color-text-muted)] hover:text-white"
              >
                <Icons.Close />
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
