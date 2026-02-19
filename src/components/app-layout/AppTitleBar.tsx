import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconMinus, IconSquare, IconX } from "../icons";

interface AppTitleBarProps {
  platform: "macos" | "windows";
}

export default function AppTitleBar({ platform }: AppTitleBarProps) {
  const appWindow = getCurrentWindow();

  return (
    <div
      className="drag-region shrink-0 flex items-center justify-end"
      data-tauri-drag-region
      onMouseDown={(e) => {
        // Only drag if clicking on the bar itself, not on child buttons
        if (e.target === e.currentTarget && e.button === 0 && e.detail === 1) {
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
  );
}
