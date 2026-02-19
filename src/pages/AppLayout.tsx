import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppNavigation from "../components/app-layout/AppNavigation";
import AppSidebarDragRegion from "../components/app-layout/AppSidebarDragRegion";
import AppSidebarUser from "../components/app-layout/AppSidebarUser";
import AppTitleBar from "../components/app-layout/AppTitleBar";

export default function AppLayout() {
  const [platform] = useState<"macos" | "windows">(() => {
    // Detect platform: macOS has traffic lights handled by Tauri overlay
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macos";
    return "windows";
  });

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
        <AppSidebarDragRegion platform={platform} />

        {/* App branding */}
        <div className="px-5 pb-4">
          <h1 className="text-lg font-bold text-text-primary tracking-tight">
            {t("app.title")}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">{t("app.subtitle")}</p>
        </div>

        {/* Navigation */}
        <AppNavigation />

        {/* Bottom section */}
        <AppSidebarUser />
      </aside>

      {/* ── Main Content Area (Top Layer) ── */}
      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {/* Title bar / drag region */}
        <AppTitleBar platform={platform} />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
