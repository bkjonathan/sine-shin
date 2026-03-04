import AccountBook from "../../pages/AccountBook";
import CustomerDetail from "../../pages/CustomerDetail";
import Customers from "../../pages/Customers";
import Dashboard from "../../pages/Dashboard";
import Expenses from "../../pages/Expenses";
import Help from "../../pages/Help";
import OrderDetail from "../../pages/OrderDetail";
import Orders from "../../pages/Orders";
import Reports from "../../pages/Reports";
import Settings from "../../pages/Settings";
import Staff from "../../pages/Staff";
import { getPathnameFromTabPath } from "../../utils/tabRoutes";

interface AppTabRoutesProps {
  locationPath: string;
}

/**
 * Renders the page component that matches the given tab path.
 * No nested <Routes> — we match manually to avoid React Router conflicts
 * and to support the keep-alive (display:none) pattern.
 */
export default function AppTabRoutes({ locationPath }: AppTabRoutesProps) {
  const pathname = getPathnameFromTabPath(locationPath);

  // Match dynamic routes first
  const orderDetailMatch = pathname.match(/^\/orders\/(\d+)$/);
  if (orderDetailMatch) {
    return <OrderDetail id={orderDetailMatch[1]} />;
  }

  const customerDetailMatch = pathname.match(/^\/customers\/(\d+)$/);
  if (customerDetailMatch) {
    return <CustomerDetail id={customerDetailMatch[1]} />;
  }

  // Static routes
  switch (pathname) {
    case "/dashboard":
      return <Dashboard />;
    case "/orders":
      return <Orders />;
    case "/expenses":
      return <Expenses />;
    case "/account-book":
      return <AccountBook />;
    case "/staff":
      return <Staff />;
    case "/reports":
      return <Reports />;
    case "/customers":
      return <Customers />;
    case "/settings":
      return <Settings />;
    case "/help":
      return <Help />;
    default:
      return <Dashboard />;
  }
}
