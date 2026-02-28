import { useTranslation } from "react-i18next";
import { AccountTabType } from "../../../types/accountBook";
import { motion } from "framer-motion";

interface AccountBookTabsProps {
  activeTab: AccountTabType;
  onTabChange: (tab: AccountTabType) => void;
}

export default function AccountBookTabs({
  activeTab,
  onTabChange,
}: AccountBookTabsProps) {
  const { t } = useTranslation();

  const tabs: { id: AccountTabType; label: string }[] = [
    { id: "income", label: t("account_book.tab_income", "Income (Orders)") },
    { id: "expenses", label: t("account_book.tab_expenses", "Expenses") },
    { id: "summary", label: t("account_book.tab_summary", "Summary") },
  ];

  return (
    <div className="flex justify-center mb-6">
      <div className="glass-panel p-1 inline-flex bg-glass-surface/50 backdrop-blur-md rounded-full shadow-inner border border-glass-border">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative px-6 py-2 text-sm font-medium rounded-full transition-colors focus:outline-none ${
                isActive
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-accent-blue/20 box-shadow px-px rounded-full"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
