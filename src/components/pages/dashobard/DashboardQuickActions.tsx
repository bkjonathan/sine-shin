import { useTranslation } from "react-i18next";
import { ShoppingCart, PackagePlus, UsersRound, BarChart3 } from "lucide-react";

interface DashboardQuickActionsProps {
  onNavigate: (path: string) => void;
}

const quickActions = [
  {
    label: "dashboard.actions.new_order",
    icon: ShoppingCart,
    path: "/orders/new",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    label: "dashboard.actions.add_product",
    icon: PackagePlus,
    path: "/inventory/new",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    label: "dashboard.actions.manage_staff",
    icon: UsersRound,
    path: "/staff",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    label: "dashboard.actions.reports",
    icon: BarChart3,
    path: "/reports",
    gradient: "from-amber-500 to-orange-500",
  },
];

export default function DashboardQuickActions({
  onNavigate,
}: DashboardQuickActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-4">
        {t("dashboard.quick_actions")}
      </h2>

      <div className="grid grid-cols-2 gap-2.5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onNavigate(action.path)}
            className="
              flex flex-col items-center gap-2 p-4 rounded-xl
              bg-white/3 border border-glass-border
              text-center transition-all duration-200
              hover:bg-white/6 hover:border-glass-border-light
              hover:-translate-y-0.5 hover:shadow-md
              group
            "
          >
            <div
              className={`w-10 h-10 rounded-xl bg-linear-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200`}
            >
              <action.icon className="text-white w-5 h-5" />
            </div>
            <p className="text-[11px] font-medium text-text-secondary group-hover:text-text-primary transition-colors leading-tight">
              {t(action.label)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
