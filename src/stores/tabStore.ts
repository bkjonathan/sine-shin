import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_TAB_PATH,
  getPathnameFromTabPath,
  isSupportedTabPath,
  normalizeTabPath,
} from "../utils/tabRoutes";

export interface Tab {
  id: string;
  path: string;
  title: string;
  icon?: string;
  pinned?: boolean;
  history: string[];
  historyIndex: number;
}

interface OpenTabOptions {
  activate?: boolean;
  icon?: string;
  pinned?: boolean;
  forceDuplicate?: boolean;
}

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string | null;
}

export interface TabStoreActions {
  openTab: (path: string, title: string, options?: OpenTabOptions) => string;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  duplicateTab: (id: string) => void;
  togglePinTab: (id: string) => void;
  reorderTabs: (draggedId: string, targetId: string) => void;
  navigateInTab: (id: string, path: string, title?: string) => void;
  updateTabTitles: (titleResolver: (path: string) => string) => void;
}

export type TabStore = TabStoreState & TabStoreActions;

const createTabStateSlice = (): TabStoreState => ({
  tabs: [],
  activeTabId: null,
});

const TAB_STORE_KEY = "app_route_tabs_v2";
const MAX_OPEN_TABS = 12;

const createTabId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const partitionPinnedTabs = (tabs: Tab[]): Tab[] => {
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const regularTabs = tabs.filter((tab) => !tab.pinned);
  return [...pinnedTabs, ...regularTabs];
};

const trimTabsToLimit = (tabs: Tab[], protectedTabIds: Array<string | null>) => {
  if (tabs.length <= MAX_OPEN_TABS) {
    return tabs;
  }

  const nextTabs = [...tabs];
  const protectedIds = new Set(
    protectedTabIds.filter((value): value is string => typeof value === "string"),
  );

  while (nextTabs.length > MAX_OPEN_TABS) {
    let removeIndex = nextTabs.findIndex(
      (tab) => !tab.pinned && !protectedIds.has(tab.id),
    );

    if (removeIndex < 0) {
      removeIndex = nextTabs.findIndex((tab) => !protectedIds.has(tab.id));
    }

    if (removeIndex < 0) {
      removeIndex = 0;
    }

    nextTabs.splice(removeIndex, 1);
  }

  return partitionPinnedTabs(nextTabs);
};

const sanitizeHistory = (history: string[], fallbackPath: string): string[] => {
  const validPaths = history
    .map((entry) => normalizeTabPath(entry))
    .filter((entry) => isSupportedTabPath(getPathnameFromTabPath(entry)));

  if (validPaths.length > 0) {
    return validPaths;
  }

  return [fallbackPath];
};

const createTab = (
  path: string,
  title: string,
  options: OpenTabOptions = {},
): Tab => {
  const normalizedPath = normalizeTabPath(path);

  return {
    id: createTabId(),
    path: normalizedPath,
    title,
    icon: options.icon,
    pinned: options.pinned ?? false,
    history: [normalizedPath],
    historyIndex: 0,
  };
};

const sanitizePersistedTabs = (tabs: unknown): Tab[] => {
  if (!Array.isArray(tabs)) {
    return [];
  }

  return tabs
    .flatMap((tab): Tab[] => {
      if (!tab || typeof tab !== "object") {
        return [];
      }

      const value = tab as Partial<Tab>;
      if (typeof value.id !== "string" || typeof value.path !== "string") {
        return [];
      }

      const normalizedPath = normalizeTabPath(value.path);
      if (!isSupportedTabPath(getPathnameFromTabPath(normalizedPath))) {
        return [];
      }

      const history = sanitizeHistory(value.history ?? [], normalizedPath);
      const maxHistoryIndex = history.length - 1;
      const historyIndex =
        typeof value.historyIndex === "number" && value.historyIndex >= 0
          ? Math.min(value.historyIndex, maxHistoryIndex)
          : maxHistoryIndex;

      return [
        {
          id: value.id,
          path: normalizedPath,
          title: typeof value.title === "string" ? value.title : normalizedPath,
          icon: typeof value.icon === "string" ? value.icon : undefined,
          pinned: Boolean(value.pinned),
          history,
          historyIndex,
        },
      ];
    })
    .reduce<Tab[]>((acc, tab) => {
      if (acc.some((existing) => existing.id === tab.id)) {
        return acc;
      }
      acc.push(tab);
      return acc;
    }, []);
};

const ensureNonEmptyTabs = (tabs: Tab[]): Tab[] => {
  if (tabs.length > 0) {
    return tabs;
  }

  return [createTab(DEFAULT_TAB_PATH, "Dashboard", { pinned: true })];
};

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      ...createTabStateSlice(),

      openTab: (path, title, options = {}) => {
        const normalizedPath = normalizeTabPath(path);
        const normalizedPathname = getPathnameFromTabPath(normalizedPath);
        if (!isSupportedTabPath(normalizedPathname)) {
          return get().activeTabId ?? "";
        }

        const state = get();

        if (!options.forceDuplicate) {
          const existingTab =
            state.tabs.find(
              (tab) =>
                tab.id === state.activeTabId &&
                getPathnameFromTabPath(tab.path) === normalizedPathname,
            ) ?? state.tabs.find((tab) => tab.path === normalizedPath);
          const fallbackByPathname = state.tabs.find(
            (tab) => getPathnameFromTabPath(tab.path) === normalizedPathname,
          );
          const targetTab = existingTab ?? fallbackByPathname;

          if (targetTab) {
            const nextPinned = options.pinned ?? targetTab.pinned;
            const currentHistory = targetTab.history.length
              ? [...targetTab.history]
              : [targetTab.path];
            let nextHistory = currentHistory;
            let nextHistoryIndex = Math.min(
              targetTab.historyIndex,
              Math.max(0, currentHistory.length - 1),
            );

            const currentPath = currentHistory[nextHistoryIndex];
            if (currentPath !== normalizedPath) {
              nextHistory = [...currentHistory];
              if (nextHistory[nextHistoryIndex + 1] === normalizedPath) {
                nextHistoryIndex += 1;
              } else if (nextHistory[nextHistoryIndex - 1] === normalizedPath) {
                nextHistoryIndex -= 1;
              } else {
                nextHistory.splice(nextHistoryIndex + 1);
                nextHistory.push(normalizedPath);
                nextHistoryIndex = nextHistory.length - 1;
              }
            }

            const shouldUpdate =
              targetTab.path !== normalizedPath ||
              targetTab.title !== title ||
              targetTab.icon !== options.icon ||
              targetTab.pinned !== nextPinned ||
              targetTab.historyIndex !== nextHistoryIndex ||
              nextHistory.length !== targetTab.history.length ||
              nextHistory.some(
                (entry, index) => entry !== targetTab.history[index],
              );

            if (shouldUpdate) {
              const nextTabs = partitionPinnedTabs(
                state.tabs.map((tab) =>
                  tab.id === targetTab.id
                    ? {
                        ...tab,
                        path: normalizedPath,
                        title,
                        icon: options.icon ?? tab.icon,
                        pinned: nextPinned,
                        history: nextHistory,
                        historyIndex: nextHistoryIndex,
                      }
                    : tab,
                ),
              );

              set({ tabs: nextTabs, activeTabId: targetTab.id });
            } else if (state.activeTabId !== targetTab.id) {
              set({ activeTabId: targetTab.id });
            }

            return targetTab.id;
          }
        }

        const newTab = createTab(normalizedPath, title, options);
        const nextTabs = trimTabsToLimit(
          partitionPinnedTabs([...state.tabs, newTab]),
          [newTab.id, state.activeTabId],
        );

        set({
          tabs: nextTabs,
          activeTabId:
            options.activate === false
              ? state.activeTabId ?? newTab.id
              : newTab.id,
        });

        return newTab.id;
      },

      setActiveTab: (id) => {
        const state = get();
        if (!state.tabs.some((tab) => tab.id === id)) {
          return;
        }

        if (state.activeTabId === id) {
          return;
        }

        set({ activeTabId: id });
      },

      closeTab: (id) => {
        const state = get();
        const tabIndex = state.tabs.findIndex((tab) => tab.id === id);
        if (tabIndex === -1) {
          return;
        }

        const remainingTabs = state.tabs.filter((tab) => tab.id !== id);
        const nextTabs = ensureNonEmptyTabs(remainingTabs);

        if (state.activeTabId !== id) {
          set({ tabs: nextTabs });
          return;
        }

        const preferredNextTab =
          nextTabs[tabIndex] ?? nextTabs[tabIndex - 1] ?? nextTabs[0] ?? null;

        set({
          tabs: nextTabs,
          activeTabId: preferredNextTab?.id ?? null,
        });
      },

      closeOthers: (id) => {
        const state = get();
        if (!state.tabs.some((tab) => tab.id === id)) {
          return;
        }

        const nextTabs = state.tabs.filter((tab) => tab.id === id || tab.pinned);
        set({
          tabs: ensureNonEmptyTabs(nextTabs),
          activeTabId: id,
        });
      },

      closeAll: () => {
        const state = get();
        const pinnedTabs = state.tabs.filter((tab) => tab.pinned);

        if (pinnedTabs.length > 0) {
          set({
            tabs: pinnedTabs,
            activeTabId: pinnedTabs[0].id,
          });
          return;
        }

        const fallbackTab = createTab(DEFAULT_TAB_PATH, "Dashboard", {
          pinned: true,
        });

        set({
          tabs: [fallbackTab],
          activeTabId: fallbackTab.id,
        });
      },

      duplicateTab: (id) => {
        const state = get();
        const originalTab = state.tabs.find((tab) => tab.id === id);
        if (!originalTab) {
          return;
        }

        const clone: Tab = {
          ...originalTab,
          id: createTabId(),
          history: [...originalTab.history],
        };

        const sourceIndex = state.tabs.findIndex((tab) => tab.id === id);
        const nextTabs = [...state.tabs];
        nextTabs.splice(sourceIndex + 1, 0, clone);
        const limitedTabs = trimTabsToLimit(nextTabs, [clone.id, state.activeTabId]);

        set({
          tabs: limitedTabs,
          activeTabId: clone.id,
        });
      },

      togglePinTab: (id) => {
        const state = get();
        const nextTabs = partitionPinnedTabs(
          state.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  pinned: !tab.pinned,
                }
              : tab,
          ),
        );

        set({ tabs: nextTabs });
      },

      reorderTabs: (draggedId, targetId) => {
        if (draggedId === targetId) {
          return;
        }

        const state = get();
        const fromIndex = state.tabs.findIndex((tab) => tab.id === draggedId);
        const toIndex = state.tabs.findIndex((tab) => tab.id === targetId);

        if (fromIndex === -1 || toIndex === -1) {
          return;
        }

        const draggedTab = state.tabs[fromIndex];
        const targetTab = state.tabs[toIndex];
        if (Boolean(draggedTab.pinned) !== Boolean(targetTab.pinned)) {
          return;
        }

        const nextTabs = [...state.tabs];
        const [removed] = nextTabs.splice(fromIndex, 1);
        nextTabs.splice(toIndex, 0, removed);

        set({ tabs: nextTabs });
      },

      navigateInTab: (id, path, title) => {
        const normalizedPath = normalizeTabPath(path);
        if (!isSupportedTabPath(getPathnameFromTabPath(normalizedPath))) {
          return;
        }

        set((state) => {
          const tabIndex = state.tabs.findIndex((tab) => tab.id === id);
          if (tabIndex === -1) {
            return state;
          }

          const targetTab = state.tabs[tabIndex];
          const history = targetTab.history.length
            ? [...targetTab.history]
            : [targetTab.path];
          let historyIndex = Math.min(
            targetTab.historyIndex,
            Math.max(0, history.length - 1),
          );

          const currentPath = history[historyIndex];
          if (currentPath !== normalizedPath) {
            if (history[historyIndex + 1] === normalizedPath) {
              historyIndex += 1;
            } else if (history[historyIndex - 1] === normalizedPath) {
              historyIndex -= 1;
            } else {
              history.splice(historyIndex + 1);
              history.push(normalizedPath);
              historyIndex = history.length - 1;
            }
          }

          const nextTitle = title ?? targetTab.title;
          if (
            targetTab.path === normalizedPath &&
            targetTab.title === nextTitle &&
            targetTab.historyIndex === historyIndex
          ) {
            return state;
          }

          const nextTabs = [...state.tabs];
          nextTabs[tabIndex] = {
            ...targetTab,
            path: normalizedPath,
            title: nextTitle,
            history,
            historyIndex,
          };

          return {
            ...state,
            tabs: nextTabs,
          };
        });
      },

      updateTabTitles: (titleResolver) => {
        set((state) => {
          let hasChanged = false;
          const nextTabs = state.tabs.map((tab) => {
            const nextTitle = titleResolver(tab.path);
            if (nextTitle === tab.title) {
              return tab;
            }

            hasChanged = true;
            return {
              ...tab,
              title: nextTitle,
            };
          });

          if (!hasChanged) {
            return state;
          }

          return {
            ...state,
            tabs: nextTabs,
          };
        });
      },
    }),
    {
      name: TAB_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
      merge: (persistedState, currentState) => {
        const value = persistedState as Partial<TabStore> | undefined;
        const nextTabs = ensureNonEmptyTabs(
          trimTabsToLimit(sanitizePersistedTabs(value?.tabs), []),
        );

        const nextActiveTabId =
          typeof value?.activeTabId === "string" &&
          nextTabs.some((tab) => tab.id === value.activeTabId)
            ? value.activeTabId
            : nextTabs[0]?.id ?? null;

        return {
          ...currentState,
          tabs: nextTabs,
          activeTabId: nextActiveTabId,
        };
      },
    },
  ),
);
