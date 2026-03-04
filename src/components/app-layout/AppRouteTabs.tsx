import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCopy,
  IconPin,
  IconPlus,
  IconX,
} from "../icons";
import type { Tab } from "../../stores/tabStore";

interface AppRouteTabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  onTogglePinTab: (tabId: string) => void;
  onDuplicateTab: (tabId: string) => void;
  onReorderTabs: (draggedId: string, targetId: string) => void;
  onNewTab: () => void;
}

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export default function AppRouteTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onTogglePinTab,
  onDuplicateTab,
  onReorderTabs,
  onNewTab,
}: AppRouteTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const contextMenuTab = useMemo(
    () => tabs.find((tab) => tab.id === contextMenu?.tabId) ?? null,
    [contextMenu?.tabId, tabs],
  );

  const updateScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const hasOverflow = container.scrollWidth - container.clientWidth > 1;
    const isAtStart = container.scrollLeft <= 1;
    const reachedEnd =
      container.scrollLeft + container.clientWidth >= container.scrollWidth - 1;
    setCanScrollLeft(hasOverflow && !isAtStart);
    setCanScrollRight(hasOverflow && !reachedEnd);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [tabs, activeTabId, updateScrollState]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      updateScrollState();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) {
      return;
    }

    const activeElement = scrollRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${activeTabId}"]`,
    );

    activeElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = () => {
      setContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const handleScrollRight = () => {
    scrollRef.current?.scrollBy({ left: 180, behavior: "smooth" });
  };

  const handleScrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -180, behavior: "smooth" });
  };

  const handleContextAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <div className="px-4 pt-2 shrink-0">
      <div className="glass-panel relative px-2 py-1.5">
        <div
          ref={scrollRef}
          className="hide-scrollbar overflow-x-auto overflow-y-hidden px-10"
        >
          <div className="flex items-center gap-1 min-w-max">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isPinned = Boolean(tab.pinned);
              const canClose = tabs.length > 1 && !isPinned;

              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  draggable
                  onDragStart={(event) => {
                    setDraggedTabId(tab.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tab.id);
                  }}
                  onDragEnd={() => {
                    setDraggedTabId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceTabId =
                      draggedTabId ?? event.dataTransfer.getData("text/plain");
                    if (!sourceTabId) {
                      return;
                    }
                    onReorderTabs(sourceTabId, tab.id);
                    setDraggedTabId(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      tabId: tab.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={
                    `group no-drag inline-flex items-center gap-1 rounded-lg text-xs font-medium transition-all border ` +
                    (isActive
                      ? "-translate-y-px text-text-primary bg-glass-white-hover border-glass-border shadow-[0_8px_16px_rgba(0,0,0,0.12)]"
                      : "text-text-secondary border-transparent hover:bg-glass-white hover:text-text-primary")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className="px-3 py-1.5 inline-flex items-center gap-1.5"
                  >
                    {isPinned && <IconPin size={11} strokeWidth={1.7} />}
                    <span className="max-w-[180px] truncate block">{tab.title}</span>
                  </button>
                  {canClose && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="mr-1 inline-flex items-center justify-center rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-glass-white-hover"
                      aria-label={`Close ${tab.title}`}
                    >
                      <IconX size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={onNewTab}
              className="no-drag inline-flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-glass-border text-text-secondary hover:text-text-primary hover:bg-glass-white"
              aria-label="Open new tab"
              title="Open new tab"
            >
              <IconPlus size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {canScrollRight && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 no-drag">
            <button
              type="button"
              onClick={handleScrollRight}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-text-muted hover:text-text-primary bg-glass-white/70 border border-glass-border hover:bg-glass-white-hover transition-colors"
              aria-label="Scroll tabs right"
            >
              <IconChevronRight size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        {canScrollLeft && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 no-drag">
            <button
              type="button"
              onClick={handleScrollLeft}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-text-muted hover:text-text-primary bg-glass-white/70 border border-glass-border hover:bg-glass-white-hover transition-colors"
              aria-label="Scroll tabs left"
            >
              <IconChevronLeft size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        {contextMenu && contextMenuTab && (
          <div
            className="fixed z-[100] no-drag min-w-[170px] rounded-lg border border-glass-border bg-liquid-bg/95 p-1 shadow-2xl backdrop-blur"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 190),
              top: Math.min(contextMenu.y, window.innerHeight - 210),
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleContextAction(() => onCloseTab(contextMenuTab.id))}
              disabled={tabs.length <= 1}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-glass-white hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Close
              <IconX size={13} />
            </button>
            <button
              type="button"
              onClick={() =>
                handleContextAction(() => onCloseOthers(contextMenuTab.id))
              }
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-glass-white hover:text-text-primary"
            >
              Close Others
            </button>
            <button
              type="button"
              onClick={() => handleContextAction(onCloseAll)}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-glass-white hover:text-text-primary"
            >
              Close All
            </button>
            <button
              type="button"
              onClick={() =>
                handleContextAction(() => onTogglePinTab(contextMenuTab.id))
              }
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-glass-white hover:text-text-primary"
            >
              {contextMenuTab.pinned ? "Unpin Tab" : "Pin Tab"}
              <IconPin size={13} />
            </button>
            <button
              type="button"
              onClick={() =>
                handleContextAction(() => onDuplicateTab(contextMenuTab.id))
              }
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-glass-white hover:text-text-primary"
            >
              Duplicate
              <IconClipboardCopy size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
