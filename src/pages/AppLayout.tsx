import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppNavigation from "../components/app-layout/AppNavigation";
import AppRouteTabs from "../components/app-layout/AppRouteTabs";
import AppSidebarDragRegion from "../components/app-layout/AppSidebarDragRegion";
import AppSidebarUser from "../components/app-layout/AppSidebarUser";
import AppTabRoutes from "../components/app-layout/AppTabRoutes";
import AppTitleBar from "../components/app-layout/AppTitleBar";
import { useSound } from "../context/SoundContext";
import { type Tab, useTabStore } from "../stores/tabStore";
import { getRouteLabel, DEFAULT_TAB_PATH } from "../utils/tabRoutes";
import { version } from "../../package.json";

function KeepAliveTabPanel({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  return (
    <div
      style={{ display: isActive ? "block" : "none" }}
      className="h-full overflow-y-auto overflow-x-hidden"
    >
      <AppTabRoutes locationPath={tab.path} />
    </div>
  );
}

export default function AppLayout() {
  const platform = useMemo<"macos" | "windows">(() => {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("mac") ? "macos" : "windows";
  }, []);

  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { playSound } = useSound();

  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const openTab = useTabStore((state) => state.openTab);
  const setActiveTab = useTabStore((state) => state.setActiveTab);
  const closeTab = useTabStore((state) => state.closeTab);
  const closeOthers = useTabStore((state) => state.closeOthers);
  const closeAll = useTabStore((state) => state.closeAll);
  const duplicateTab = useTabStore((state) => state.duplicateTab);
  const togglePinTab = useTabStore((state) => state.togglePinTab);
  const reorderTabs = useTabStore((state) => state.reorderTabs);
  const updateTabTitles = useTabStore((state) => state.updateTabTitles);

  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) ?? null;
  }, [activeTabId, tabs]);

  // One-way sync: tab store → URL bar (passive display only).
  // We never read location to drive tab state — the store is the single source of truth.
  const lastNavigatedPathRef = useRef<string | null>(null);

  useEffect(() => {
    const targetPath = activeTab?.path ?? DEFAULT_TAB_PATH;
    if (lastNavigatedPathRef.current === targetPath) {
      return;
    }
    lastNavigatedPathRef.current = targetPath;
    navigate(targetPath, { replace: true });
  }, [activeTab?.path, navigate]);

  // Update tab titles when language changes.
  useEffect(() => {
    updateTabTitles((path) => getRouteLabel(path, t));
  }, [i18n.language, t, updateTabTitles]);

  const handleSelectTab = (tabId: string) => {
    if (tabId === activeTabId) return;
    playSound("click");
    setActiveTab(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    playSound("click");
    closeTab(tabId);
  };

  const handleCloseOthers = (tabId: string) => {
    playSound("click");
    closeOthers(tabId);
  };

  const handleCloseAll = () => {
    playSound("click");
    closeAll();
  };

  const handleTogglePinTab = (tabId: string) => {
    playSound("click");
    togglePinTab(tabId);
  };

  const handleDuplicateTab = (tabId: string) => {
    playSound("click");
    duplicateTab(tabId);
  };

  const handleNewTab = () => {
    playSound("click");
    openTab(DEFAULT_TAB_PATH, getRouteLabel(DEFAULT_TAB_PATH, t));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>

      <aside
        className="glass-sidebar relative z-10 flex flex-col"
        style={{
          width: "var(--sidebar-width)",
          minWidth: "var(--sidebar-width)",
        }}
      >
        <AppSidebarDragRegion platform={platform} />

        <div className="px-5 pb-4">
          <h1 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
            {t("app.title")}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
              v{version}
            </span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">{t("app.subtitle")}</p>
        </div>

        <AppNavigation />
        <AppSidebarUser />
      </aside>

      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <AppTitleBar platform={platform} />

        <AppRouteTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onCloseOthers={handleCloseOthers}
          onCloseAll={handleCloseAll}
          onTogglePinTab={handleTogglePinTab}
          onDuplicateTab={handleDuplicateTab}
          onReorderTabs={reorderTabs}
          onNewTab={handleNewTab}
        />

        <main className="flex-1 overflow-hidden p-6 pt-4">
          <div className="h-full">
            {tabs.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            ) : (
              tabs.map((tab) => (
                <KeepAliveTabPanel
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
