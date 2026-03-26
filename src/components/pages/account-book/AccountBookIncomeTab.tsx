import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getOrders } from "../../../api/orderApi";
import { OrderWithCustomer } from "../../../types/order";
import { AccountBookRow, AccountBookTotals } from "../../../types/accountBook";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { useTabNavigation } from "../../../hooks/useTabNavigation";
import {
  pageContainerVariants,
  pageItemSoftVariants,
} from "../../../constants/animations";
import AccountBookHeader from "./AccountBookHeader";
import AccountBookSummaryCards from "./AccountBookSummaryCards";
import AccountBookTable from "./AccountBookTable";

const calculateServiceFeeAmount = (order: OrderWithCustomer) => {
  if (order.service_fee_type === "percent") {
    return ((order.total_price || 0) * (order.service_fee || 0)) / 100;
  }
  return order.service_fee || 0;
};

interface AccountBookIncomeTabProps {
  dateFrom: Date | null;
  dateTo: Date | null;
}

const toDateOnlyString = (value: Date | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function AccountBookIncomeTab({
  dateFrom,
  dateTo,
}: AccountBookIncomeTabProps) {
  const { navigateInTab } = useTabNavigation();
  const { formatPrice } = useAppSettings();
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        const data = await getOrders();
        setOrders(data);
      } catch (error) {
        console.error("Failed to load account book data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  const rows = useMemo<AccountBookRow[]>(() => {
    const searchTerm = search.trim().toLowerCase();
    const dfStr = toDateOnlyString(dateFrom);
    const dtStr = toDateOnlyString(dateTo);

    return orders
      .filter((order) => {
        // Apply date filter
        const orderDateStr = order.order_date
          ? order.order_date.split("T")[0]
          : order.created_at
            ? order.created_at.split("T")[0]
            : "";

        if (dfStr && orderDateStr < dfStr) return false;
        if (dtStr && orderDateStr > dtStr) return false;

        // Apply search filter
        if (!searchTerm) {
          return true;
        }

        return [order.order_id, order.customer_name, order.order_from]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchTerm));
      })
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return b.id.localeCompare(a.id);
      })
      .map((order) => {
        const serviceFeeAmount = calculateServiceFeeAmount(order);
        const productDiscount = order.product_discount || 0;
        const cargoFee = order.exclude_cargo_fee ? 0 : order.cargo_fee || 0;
        const profit = serviceFeeAmount + productDiscount + cargoFee;

        return {
          order,
          serviceFeeAmount,
          productDiscount,
          cargoFee,
          profit,
        };
      });
  }, [orders, search, dateFrom, dateTo]);

  const totals = useMemo<AccountBookTotals>(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalSales += row.order.total_price || 0;
        acc.totalServiceFee += row.serviceFeeAmount;
        acc.totalDiscount += row.productDiscount;
        acc.totalCargoFee += row.cargoFee;
        acc.totalProfit += row.profit;
        return acc;
      },
      {
        totalSales: 0,
        totalServiceFee: 0,
        totalDiscount: 0,
        totalCargoFee: 0,
        totalProfit: 0,
      },
    );
  }, [rows]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={pageContainerVariants}
      className="h-full flex flex-col"
    >
      <motion.div variants={pageItemSoftVariants}>
        <AccountBookHeader search={search} onSearchChange={setSearch} />
      </motion.div>

      <motion.div variants={pageItemSoftVariants}>
        <AccountBookSummaryCards
          totalRows={rows.length}
          totals={totals}
          formatPrice={formatPrice}
        />
      </motion.div>

      <motion.div
        variants={pageItemSoftVariants}
        className="glass-panel p-4 flex-1 min-h-[400px] overflow-hidden"
      >
        <AccountBookTable
          loading={loading}
          rows={rows}
          formatPrice={formatPrice}
          onViewOrder={(orderId) => navigateInTab(`/orders/${orderId}`)}
        />
      </motion.div>
    </motion.div>
  );
}
