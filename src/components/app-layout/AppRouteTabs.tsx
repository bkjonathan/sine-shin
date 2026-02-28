import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconX } from "../icons";

export interface RouteTab {
  id: string;
  to: string;
  label: string;
}

interface AppRouteTabsProps {
  tabs: RouteTab[];
  activeTabId: string;
  onSelectTab: (tab: RouteTab) => void;
  onCloseTab: (tab: RouteTab) => void;
}

export default function AppRouteTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: AppRouteTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const handleScrollRight = () => {
    scrollRef.current?.scrollBy({ left: 180, behavior: "smooth" });
  };

  const handleScrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -180, behavior: "smooth" });
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
              const canClose = tabs.length > 1;

              return (
                <div
                  key={tab.id}
                  className={
                    `group no-drag inline-flex items-center gap-1 rounded-lg text-xs font-medium transition-all border ` +
                    (isActive
                      ? "text-text-primary bg-glass-white-hover border-glass-border shadow-[0_0_12px_rgba(0,0,0,0.08)]"
                      : "text-text-secondary border-transparent hover:bg-glass-white hover:text-text-primary")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab)}
                    className="px-3 py-1.5"
                  >
                    <span className="max-w-[180px] truncate block">
                      {tab.label}
                    </span>
                  </button>
                  {canClose && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTab(tab);
                      }}
                      className="mr-1 inline-flex items-center justify-center rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-glass-white-hover"
                      aria-label={`Close ${tab.label}`}
                    >
                      <IconX size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
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
      </div>
    </div>
  );
}
