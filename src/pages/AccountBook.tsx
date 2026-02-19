import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { getOrders } from "../api/orderApi";
import { OrderWithCustomer } from "../types/order";
import { AccountBookRow, AccountBookTotals } from "../types/accountBook";
import { useAppSettings } from "../context/AppSettingsContext";
import AccountBookHeader from "../components/pages/account-book/AccountBookHeader";
import AccountBookSummaryCards from "../components/pages/account-book/AccountBookSummaryCards";
import AccountBookTable from "../components/pages/account-book/AccountBookTable";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const calculateServiceFeeAmount = (order: OrderWithCustomer) => {
  if (order.service_fee_type === "percent") {
    return ((order.total_price || 0) * (order.service_fee || 0)) / 100;
  }
  return order.service_fee || 0;
};

export default function AccountBook() {
  const navigate = useNavigate();
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

    return orders
      .filter((order) => {
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
        return b.id - a.id;
      })
      .map((order) => {
        const serviceFeeAmount = calculateServiceFeeAmount(order);
        const productDiscount = order.product_discount || 0;
        const profit = serviceFeeAmount + productDiscount;

        return {
          order,
          serviceFeeAmount,
          productDiscount,
          profit,
        };
      });
  }, [orders, search]);

  const totals = useMemo<AccountBookTotals>(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalSales += row.order.total_price || 0;
        acc.totalServiceFee += row.serviceFeeAmount;
        acc.totalDiscount += row.productDiscount;
        acc.totalProfit += row.profit;
        return acc;
      },
      {
        totalSales: 0,
        totalServiceFee: 0,
        totalDiscount: 0,
        totalProfit: 0,
      },
    );
  }, [rows]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      <motion.div
        variants={itemVariants}
      >
        <AccountBookHeader
          search={search}
          onSearchChange={setSearch}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <AccountBookSummaryCards
          totalRows={rows.length}
          totals={totals}
          formatPrice={formatPrice}
        />
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="glass-panel p-4 flex-1 min-h-0 overflow-hidden"
      >
        <AccountBookTable
          loading={loading}
          rows={rows}
          formatPrice={formatPrice}
          onViewOrder={(orderId) => navigate(`/orders/${orderId}`)}
        />
      </motion.div>
    </motion.div>
  );
}
