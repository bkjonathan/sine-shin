import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppNavigation from "../components/app-layout/AppNavigation";
import AppSidebarDragRegion from "../components/app-layout/AppSidebarDragRegion";
import AppSidebarUser from "../components/app-layout/AppSidebarUser";
import AppTitleBar from "../components/app-layout/AppTitleBar";
import AppRouteTabs, {
  type RouteTab,
} from "../components/app-layout/AppRouteTabs";
import { useSound } from "../context/SoundContext";
import { version } from "../../package.json";

const OPEN_TABS_STORAGE_KEY = "app_open_tabs_v1";
const MAX_OPEN_TABS = 10;

const isSupportedTabPath = (pathname: string): boolean => {
  const staticRoutes = new Set([
    "/dashboard",
    "/orders",
    "/expenses",
    "/account-book",
    "/staff",
    "/reports",
    "/customers",
    "/settings",
    "/help",
  ]);

  if (staticRoutes.has(pathname)) {
    return true;
  }

  if (/^\/orders\/\d+$/.test(pathname)) {
    return true;
  }

  return /^\/customers\/\d+$/.test(pathname);
};

const getRouteLabel = (
  pathname: string,
  t: (key: string) => string,
): string => {
  if (/^\/orders\/\d+$/.test(pathname)) {
    const id = pathname.split("/").pop();
    return `${t("orders.detail.title")} #${id}`;
  }

  if (/^\/customers\/\d+$/.test(pathname)) {
    const id = pathname.split("/").pop();
    return `${t("customers.detail.title")} #${id}`;
  }

  switch (pathname) {
    case "/dashboard":
      return t("nav.dashboard");
    case "/orders":
      return t("nav.orders");
    case "/expenses":
      return t("nav.expenses");
    case "/account-book":
      return t("nav.account_book");
    case "/staff":
      return t("nav.staff");
    case "/reports":
      return t("nav.reports");
    case "/customers":
      return t("nav.customers");
    case "/settings":
      return t("nav.settings");
    case "/help":
      return t("nav.help");
    default:
      return pathname;
  }
};

const parseStoredTabs = (): RouteTab[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = localStorage.getItem(OPEN_TABS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((tab) => {
        return (
          typeof tab?.id === "string" &&
          typeof tab?.to === "string" &&
          typeof tab?.label === "string" &&
          isSupportedTabPath(tab.id)
        );
      })
      .slice(-MAX_OPEN_TABS);
  } catch {
    return [];
  }
};

export default function AppLayout() {
  const [platform] = useState<"macos" | "windows">(() => {
    // Detect platform: macOS has traffic lights handled by Tauri overlay
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macos";
    return "windows";
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { playSound } = useSound();
  const [openTabs, setOpenTabs] = useState<RouteTab[]>(() => parseStoredTabs());

  const activeTabId = useMemo(() => location.pathname, [location.pathname]);

  useEffect(() => {
    if (!isSupportedTabPath(location.pathname)) {
      return;
    }

    const nextTo = `${location.pathname}${location.search}${location.hash}`;
    const nextTab: RouteTab = {
      id: location.pathname,
      to: nextTo,
      label: getRouteLabel(location.pathname, t),
    };

    setOpenTabs((prevTabs) => {
      const existingIndex = prevTabs.findIndex((tab) => tab.id === nextTab.id);
      if (existingIndex >= 0) {
        const existingTab = prevTabs[existingIndex];
        if (
          existingTab.to === nextTab.to &&
          existingTab.label === nextTab.label
        ) {
          return prevTabs;
        }

        const nextTabs = [...prevTabs];
        nextTabs[existingIndex] = nextTab;
        return nextTabs;
      }

      const mergedTabs = [...prevTabs, nextTab];
      return mergedTabs.slice(-MAX_OPEN_TABS);
    });
  }, [i18n.language, location.hash, location.pathname, location.search]);

  useEffect(() => {
    setOpenTabs((prevTabs) => {
      return prevTabs.map((tab) => ({
        ...tab,
        label: getRouteLabel(tab.id, t),
      }));
    });
  }, [i18n.language]);

  useEffect(() => {
    localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(openTabs));
  }, [openTabs]);

  const handleSelectTab = (tab: RouteTab) => {
    if (
      tab.id === location.pathname &&
      tab.to === `${location.pathname}${location.search}${location.hash}`
    ) {
      return;
    }

    playSound("click");
    navigate(tab.to);
  };

  const handleCloseTab = (tabToClose: RouteTab) => {
    const tabIndex = openTabs.findIndex((tab) => tab.id === tabToClose.id);
    if (tabIndex === -1 || openTabs.length <= 1) {
      return;
    }

    const remainingTabs = openTabs.filter((tab) => tab.id !== tabToClose.id);
    setOpenTabs(remainingTabs);

    if (tabToClose.id !== location.pathname) {
      return;
    }

    const fallbackTab =
      remainingTabs[tabIndex] ??
      remainingTabs[tabIndex - 1] ??
      remainingTabs[remainingTabs.length - 1];

    playSound("click");
    navigate(fallbackTab?.to ?? "/dashboard");
  };

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
          <h1 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
            {t("app.title")}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
              v{version}
            </span>
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

        {/* Open route tabs */}
        <AppRouteTabs
          tabs={openTabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 pt-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
