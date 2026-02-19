import { getCurrentWindow } from "@tauri-apps/api/window";

interface AppSidebarDragRegionProps {
  platform: "macos" | "windows";
}

export default function AppSidebarDragRegion({
  platform,
}: AppSidebarDragRegionProps) {
  const appWindow = getCurrentWindow();

  return (
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
  );
}
