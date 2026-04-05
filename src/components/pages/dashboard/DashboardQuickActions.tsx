import { useTranslation } from "react-i18next";
import { ShoppingCart, UserRound, Wallet, Settings, ChevronRight } from "lucide-react";

interface DashboardQuickActionsProps {
  onNavigate: (path: string) => void;
}

const quickActions = [
  {
    label: "dashboard.actions.orders",
    icon: ShoppingCart,
    path: "/orders",
    gradient: "from-blue-500 to-cyan-500",
    description: "dashboard.actions.orders_desc",
  },
  {
    label: "dashboard.actions.customers",
    icon: UserRound,
    path: "/customers",
    gradient: "from-violet-500 to-purple-500",
    description: "dashboard.actions.customers_desc",
  },
  {
    label: "dashboard.actions.expenses",
    icon: Wallet,
    path: "/expenses",
    gradient: "from-emerald-500 to-teal-500",
    description: "dashboard.actions.expenses_desc",
  },
  {
    label: "dashboard.actions.settings",
    icon: Settings,
    path: "/settings",
    gradient: "from-amber-500 to-orange-500",
    description: "dashboard.actions.settings_desc",
  },
];

export default function DashboardQuickActions({
  onNavigate,
}: DashboardQuickActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-glass-border">
        <h2 className="text-sm font-semibold text-text-primary leading-tight">
          {t("dashboard.quick_actions")}
        </h2>
        <p className="text-[10px] text-text-muted mt-0.5">
          {quickActions.length} shortcuts
        </p>
      </div>

      {/* Action list */}
      <div className="flex-1 px-3 py-2 divide-y divide-glass-border/40">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onNavigate(action.path)}
            className="w-full flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl text-left transition-all duration-200 hover:bg-white/[0.04] group"
          >
            {/* Icon */}
            <div
              className={`w-9 h-9 rounded-xl bg-linear-to-br ${action.gradient} flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-200`}
            >
              <action.icon className="text-white w-4 h-4" />
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors leading-tight">
                {t(action.label)}
              </p>
            </div>

            {/* Arrow */}
            <ChevronRight
              size={14}
              className="text-text-muted/40 group-hover:text-accent-blue group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
