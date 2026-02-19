import { useTranslation } from "react-i18next";

interface DashboardQuickActionsProps {
  onNavigate: (path: string) => void;
}

const quickActions = [
  {
    label: "dashboard.actions.new_order",
    icon: "🛒",
    desc: "dashboard.actions.new_order_desc",
    path: "/orders/new",
  },
  {
    label: "dashboard.actions.add_product",
    icon: "➕",
    desc: "dashboard.actions.add_product_desc",
    path: "/inventory/new",
  },
  {
    label: "dashboard.actions.manage_staff",
    icon: "👥",
    desc: "dashboard.actions.manage_staff_desc",
    path: "/staff",
  },
  {
    label: "dashboard.actions.reports",
    icon: "📊",
    desc: "dashboard.actions.reports_desc",
    path: "/reports",
  },
];

export default function DashboardQuickActions({
  onNavigate,
}: DashboardQuickActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-5">
        {t("dashboard.quick_actions")}
      </h2>

      <div className="space-y-2">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onNavigate(action.path)}
            className="
              w-full flex items-center gap-3 p-3.5 rounded-xl
              bg-white/3 border border-white/5
              text-left transition-all duration-200
              hover:bg-white/6 hover:border-white/10
              hover:shadow-[0_4px_16px_rgba(91,127,255,0.06)]
              group
            "
          >
            <span className="text-lg">{action.icon}</span>
            <div>
              <p className="text-sm font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                {t(action.label)}
              </p>
              <p className="text-xs text-text-muted">{t(action.desc)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
