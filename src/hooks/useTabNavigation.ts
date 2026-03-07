import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTabStore } from "../stores/tabStore";
import { getRouteLabel } from "../utils/tabRoutes";

interface OpenTabOptions {
  pinned?: boolean;
  forceDuplicate?: boolean;
}

interface UseTabNavigationResult {
  activeTabId: string | null;
  openTab: (path: string, options?: OpenTabOptions) => string;
  navigateInTab: (path: string) => void;
}

/**
 * Hook for tab-aware navigation.
 * Does NOT use React Router's navigate() — the tab store is the single source of truth.
 * AppLayout handles the one-way sync from tab store → URL bar.
 */
export function useTabNavigation(): UseTabNavigationResult {
  const { t } = useTranslation();

  const activeTabId = useTabStore((state) => state.activeTabId);
  const openTabStore = useTabStore((state) => state.openTab);
  const navigateInTabStore = useTabStore((state) => state.navigateInTab);

  const openTab = useCallback(
    (path: string, options?: OpenTabOptions) => {
      const title = getRouteLabel(path, t);
      return openTabStore(path, title, {
        pinned: options?.pinned,
        forceDuplicate: options?.forceDuplicate,
      });
    },
    [openTabStore, t],
  );

  const navigateInTab = useCallback(
    (path: string) => {
      if (!activeTabId) return;
      navigateInTabStore(activeTabId, path, getRouteLabel(path, t));
    },
    [activeTabId, navigateInTabStore, t],
  );

  return {
    activeTabId,
    openTab,
    navigateInTab,
  };
}
