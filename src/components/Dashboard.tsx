import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ShopData {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
}

export default function Dashboard() {
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");

  useEffect(() => {
    // We'll fetch the shop settings through a simple invoke
    // For now, show a welcome view
    loadShopData();
  }, []);

  const loadShopData = async () => {
    try {
      const data = await invoke<ShopData>("get_shop_settings");
      setShop(data);
      if (data.logo_path) {
        setLogoSrc(convertFileSrc(data.logo_path));
      }
    } catch (err) {
      console.error("Failed to load shop data:", err);
    }
  };

  return (
    <div className="w-full min-h-screen p-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-accent)] opacity-[0.03] blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600 opacity-[0.03] blur-[100px]" />
      </div>

      <div className="relative max-w-2xl mx-auto animate-fade-in-up">
        {/* Welcome Header */}
        <div className="text-center mb-10">
          {logoSrc && (
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl overflow-hidden mb-6 glass-card p-2">
              <img
                src={logoSrc}
                alt="Shop logo"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
            {shop ? `Welcome to ${shop.shop_name}` : "Welcome!"}
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Your shop is all set up and ready to go
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Orders Today", value: "0", icon: "📦" },
            { label: "Active Products", value: "0", icon: "🏷️" },
            { label: "Revenue", value: "$0", icon: "💰" },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-5 text-center">
              <span className="text-2xl mb-2 block">{stat.icon}</span>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                {stat.value}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Shop Info Card */}
        {shop && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Shop Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Name
                </span>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {shop.shop_name}
                </span>
              </div>
              {shop.phone && (
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    Phone
                  </span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {shop.phone}
                  </span>
                </div>
              )}
              {shop.address && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    Address
                  </span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">
                    {shop.address}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-6 glass-card p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Add Product", icon: "➕" },
              { label: "New Order", icon: "🛒" },
              { label: "Manage Staff", icon: "👥" },
              { label: "Settings", icon: "⚙️" },
            ].map((action) => (
              <button
                key={action.label}
                className="
                  flex items-center gap-3 p-4 rounded-xl
                  bg-[var(--color-bg-primary)] bg-opacity-50
                  border border-[var(--color-border)]
                  text-[var(--color-text-secondary)] text-sm
                  transition-all duration-200
                  hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]
                  hover:bg-opacity-80
                "
              >
                <span className="text-lg">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
