import { lazy, Suspense } from "react";

import { getPathnameFromTabPath } from "../../utils/tabRoutes";

interface AppTabRoutesProps {
  locationPath: string;
}

const AccountBookPage = lazy(() => import("../../pages/AccountBook"));
const CustomerDetailPage = lazy(() => import("../../pages/CustomerDetail"));
const CustomersPage = lazy(() => import("../../pages/Customers"));
const DashboardPage = lazy(() => import("../../pages/Dashboard"));
const ExpensesPage = lazy(() => import("../../pages/Expenses"));
const HelpPage = lazy(() => import("../../pages/Help"));
const OrderDetailPage = lazy(() => import("../../pages/OrderDetail"));
const OrdersPage = lazy(() => import("../../pages/Orders"));
const ReportsPage = lazy(() => import("../../pages/Reports"));
const SettingsPage = lazy(() => import("../../pages/Settings"));
const StaffPage = lazy(() => import("../../pages/Staff"));

function TabRouteFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
    </div>
  );
}

/**
 * Renders the page component that matches the given tab path.
 * No nested <Routes>; this avoids router ownership conflicts with keep-alive tabs.
 */
export default function AppTabRoutes({ locationPath }: AppTabRoutesProps) {
  const pathname = getPathnameFromTabPath(locationPath);

  return (
    <Suspense fallback={<TabRouteFallback />}>
      {(() => {
        const orderDetailMatch = pathname.match(/^\/orders\/(\d+)$/);
        if (orderDetailMatch) {
          return <OrderDetailPage id={orderDetailMatch[1]} />;
        }

        const customerDetailMatch = pathname.match(/^\/customers\/(\d+)$/);
        if (customerDetailMatch) {
          return <CustomerDetailPage id={customerDetailMatch[1]} />;
        }

        switch (pathname) {
          case "/dashboard":
            return <DashboardPage />;
          case "/orders":
            return <OrdersPage />;
          case "/expenses":
            return <ExpensesPage />;
          case "/account-book":
            return <AccountBookPage />;
          case "/staff":
            return <StaffPage />;
          case "/reports":
            return <ReportsPage />;
          case "/customers":
            return <CustomersPage />;
          case "/settings":
            return <SettingsPage />;
          case "/help":
            return <HelpPage />;
          default:
            return <DashboardPage />;
        }
      })()}
    </Suspense>
  );
}
