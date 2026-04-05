import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { AccountTabType } from "../types/accountBook";
import AccountBookTabs from "../components/pages/account-book/AccountBookTabs";
import AccountBookIncomeTab from "../components/pages/account-book/AccountBookIncomeTab";
import AccountBookExpenseTab from "../components/pages/account-book/AccountBookExpenseTab";
import AccountBookSummaryTab from "../components/pages/account-book/AccountBookSummaryTab";
import { useLocation, useSearchParams } from "react-router-dom";
import { useIsTabPanelActive } from "../context/TabPanelActivityContext";
import { Button } from "../components/ui";
import DatePicker from "../components/ui/DatePicker";
import { IconRefresh } from "../components/icons";
import {
  pageContainerVariants,
  pageItemSoftVariants,
} from "../constants/animations";

export default function AccountBook() {
  const { t } = useTranslation();
  const isTabPanelActive = useIsTabPanelActive();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeTab, setActiveTab] = useState<AccountTabType>(() => {
    const tabUrlParam = searchParams.get("tab");
    if (
      tabUrlParam === "income" ||
      tabUrlParam === "expenses" ||
      tabUrlParam === "summary"
    ) {
      return tabUrlParam;
    }
    return "income";
  });

  useEffect(() => {
    if (!isTabPanelActive || location.pathname !== "/account-book") {
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    if (activeTab === "income") {
      newParams.delete("tab");
    } else {
      newParams.set("tab", activeTab);
    }

    if (newParams.toString() !== searchParams.toString()) {
      setSearchParams(newParams, { replace: true });
    }
    // Intentionally not reacting to search param updates to avoid keep-alive tab ping-pong.
  }, [activeTab, isTabPanelActive, location.pathname, setSearchParams]);

  const handleTabChange = (tab: AccountTabType) => {
    setActiveTab(tab);
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={pageContainerVariants}
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      <motion.div
        variants={pageItemSoftVariants}
        className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4"
      >
        <div className="text-left">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            {t("account_book.title", "Account Book")}
          </h1>
          <p className="text-sm text-text-muted">
            {t(
              "account_book.subtitle",
              "Track your business income, expenses, and net balance",
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            onClick={() => setRefreshKey((k) => k + 1)}
            variant="ghost"
            className="px-4 py-2 text-sm flex items-center gap-2"
          >
            <IconRefresh size={16} strokeWidth={2} />
            {t("common.reload_data")}
          </Button>
          <DatePicker
            selected={dateFrom}
            onChange={(date: Date | null) => setDateFrom(date)}
            maxDate={dateTo || undefined}
            placeholderText={t("common.date_from", "Date From")}
            className="w-full sm:w-40"
          />
          <DatePicker
            selected={dateTo}
            onChange={(date: Date | null) => setDateTo(date)}
            minDate={dateFrom || undefined}
            placeholderText={t("common.date_to", "Date To")}
            className="w-full sm:w-40"
          />
        </div>
      </motion.div>

      <motion.div variants={pageItemSoftVariants}>
        <AccountBookTabs activeTab={activeTab} onTabChange={handleTabChange} />
      </motion.div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex-1 min-h-0 relative"
      >
        {activeTab === "income" && (
          <AccountBookIncomeTab dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
        )}
        {activeTab === "expenses" && (
          <AccountBookExpenseTab dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
        )}
        {activeTab === "summary" && (
          <AccountBookSummaryTab dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
        )}
      </motion.div>
    </motion.div>
  );
}
