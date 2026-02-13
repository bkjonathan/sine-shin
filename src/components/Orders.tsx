import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
} from "../api/orderApi";
import { getCustomers } from "../api/customerApi";
import { OrderWithCustomer } from "../types/order";
import { Customer } from "../types/customer";
import { useSound } from "../context/SoundContext";

// ── Animation Variants ──
const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

export default function Orders() {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { playSound } = useSound();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const initialFormState = {
    customer_id: "",
    order_from: "",
    product_qty: "",
    price: "",
    exchange_rate: "",
    shipping_fee: "",
    delivery_fee: "",
    cargo_fee: "",
    product_weight: "",
    order_date: "",
    arrived_date: "",
    shipment_date: "",
    user_withdraw_date: "",
  };
  const [formData, setFormData] = useState(initialFormState);

  // Delete State
  const [orderToDelete, setOrderToDelete] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredOrders(orders);
    } else {
      const lowerAuth = searchTerm.toLowerCase();
      setFilteredOrders(
        orders.filter(
          (o) =>
            o.order_id?.toLowerCase().includes(lowerAuth) ||
            o.customer_name?.toLowerCase().includes(lowerAuth) ||
            o.order_from?.toLowerCase().includes(lowerAuth),
        ),
      );
    }
  }, [searchTerm, orders]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await getOrders();
      setOrders(data);
      setFilteredOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    }
  };

  const handleOpenModal = (order?: OrderWithCustomer) => {
    if (order) {
      setEditingOrder(order);
      setFormData({
        customer_id: order.customer_id?.toString() || "",
        order_from: order.order_from || "",
        product_qty: order.product_qty?.toString() || "",
        price: order.price?.toString() || "",
        exchange_rate: order.exchange_rate?.toString() || "",
        shipping_fee: order.shipping_fee?.toString() || "",
        delivery_fee: order.delivery_fee?.toString() || "",
        cargo_fee: order.cargo_fee?.toString() || "",
        product_weight: order.product_weight?.toString() || "",
        order_date: order.order_date || "",
        arrived_date: order.arrived_date || "",
        shipment_date: order.shipment_date || "",
        user_withdraw_date: order.user_withdraw_date || "",
      });
    } else {
      setEditingOrder(null);
      setFormData(initialFormState);
    }
    setIsModalOpen(true);
    playSound("click");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) return;

    try {
      setIsSubmitting(true);

      const payload: any = {
        customer_id: parseInt(formData.customer_id),
        order_from: formData.order_from || undefined,
        product_qty: formData.product_qty
          ? parseInt(formData.product_qty)
          : undefined,
        price: formData.price ? parseFloat(formData.price) : undefined,
        exchange_rate: formData.exchange_rate
          ? parseFloat(formData.exchange_rate)
          : undefined,
        shipping_fee: formData.shipping_fee
          ? parseFloat(formData.shipping_fee)
          : undefined,
        delivery_fee: formData.delivery_fee
          ? parseFloat(formData.delivery_fee)
          : undefined,
        cargo_fee: formData.cargo_fee
          ? parseFloat(formData.cargo_fee)
          : undefined,
        product_weight: formData.product_weight
          ? parseFloat(formData.product_weight)
          : undefined,
        order_date: formData.order_date || undefined,
        arrived_date: formData.arrived_date || undefined,
        shipment_date: formData.shipment_date || undefined,
        user_withdraw_date: formData.user_withdraw_date || undefined,
      };

      if (editingOrder) {
        await updateOrder({
          ...editingOrder,
          ...payload,
          id: editingOrder.id,
        });
      } else {
        await createOrder(payload);
      }
      playSound("success");
      await fetchOrders();
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save order:", error);
      playSound("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    try {
      await deleteOrder(orderToDelete.id);
      playSound("success");
      await fetchOrders();
      setIsDeleteModalOpen(false);
      setOrderToDelete(null);
    } catch (error) {
      console.error("Failed to delete order:", error);
      playSound("error");
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.06 },
        },
      }}
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      {/* ── Header ── */}
      <motion.div
        variants={fadeVariants}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Orders
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Manage your orders and shipments
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-liquid btn-liquid-primary px-4 py-2 text-sm flex items-center gap-2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Order
        </button>
      </motion.div>

      {/* ── Search Bar ── */}
      <motion.div variants={fadeVariants} className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-[var(--color-text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="input-liquid pl-10 w-full"
            placeholder="Search orders, customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </motion.div>

      {/* ── Order List ── */}
      <motion.div variants={fadeVariants} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--color-glass-border)] border-t-[var(--color-accent-blue)] rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-[var(--color-glass-white)] rounded-xl border border-[var(--color-glass-border)]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-glass-white-hover)] flex items-center justify-center text-[var(--color-text-muted)]">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
            </div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
              No orders found
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Create an order to get started"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            <AnimatePresence>
              {filteredOrders.map((order) => (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-panel p-5 group hover:border-[var(--color-accent-blue)]/30 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--color-accent-blue)]/5 relative overflow-hidden"
                >
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-3">
                      <div className="bg-[var(--color-glass-white)] px-2 py-1 rounded text-xs font-mono text-[var(--color-text-secondary)] border border-[var(--color-glass-border)]">
                        {order.order_id || "ID pending..."}
                      </div>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mr-2 -mt-2">
                        <button
                          onClick={() => handleOpenModal(order)}
                          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent-blue)] hover:bg-[var(--color-glass-white-hover)] rounded-lg transition-colors"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setOrderToDelete(order);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <h3 className="font-semibold text-[var(--color-text-primary)] text-lg mb-1 truncate">
                      {order.customer_name}
                    </h3>
                    <p className="text-sm text-[var(--color-text-muted)] mb-4">
                      From:{" "}
                      <span className="text-[var(--color-text-secondary)]">
                        {order.order_from || "-"}
                      </span>
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-sm text-[var(--color-text-secondary)] mb-4 bg-[var(--color-glass-white)]/50 p-2 rounded-lg border border-[var(--color-glass-border)]/50">
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs block">
                          Date
                        </span>
                        {order.order_date || "-"}
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs block">
                          Qty
                        </span>
                        {order.product_qty || 0}
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs block">
                          Price
                        </span>
                        {order.price?.toLocaleString() || "-"}
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs block">
                          Total
                        </span>
                        {(
                          (order.product_qty || 0) * (order.price || 0)
                        ).toLocaleString()}
                      </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex gap-2 text-xs">
                      {order.arrived_date && (
                        <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20">
                          Arrived
                        </span>
                      )}
                      {order.shipment_date && (
                        <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded border border-blue-500/20">
                          Shipped
                        </span>
                      )}
                      {!order.arrived_date && !order.shipment_date && (
                        <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/20">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ── Add/Edit Modal ── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-4xl glass-panel p-6 shadow-2xl border border-[var(--color-glass-border)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
                  {editingOrder ? "Edit Order" : "Add New Order"}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-[var(--color-glass-white-hover)] rounded-full transition-colors"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Section: Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-b border-[var(--color-glass-border)] pb-1">
                    Basic Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Customer <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        className="input-liquid w-full"
                        value={formData.customer_id}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customer_id: e.target.value,
                          })
                        }
                      >
                        <option value="">Select Customer</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.customer_id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Order From
                      </label>
                      <input
                        type="text"
                        className="input-liquid w-full"
                        value={formData.order_from}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            order_from: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Order Date
                      </label>
                      <input
                        type="date"
                        className="input-liquid w-full"
                        value={formData.order_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            order_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Product & Price */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-b border-[var(--color-glass-border)] pb-1">
                    Product & Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input-liquid w-full"
                        value={formData.product_qty}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            product_qty: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Price
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Weight (kg)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.product_weight}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            product_weight: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Exchange Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.exchange_rate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            exchange_rate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Fees */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-b border-[var(--color-glass-border)] pb-1">
                    Fees
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Shipping Fee
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.shipping_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            shipping_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Delivery Fee
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.delivery_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            delivery_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Cargo Fee
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.cargo_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cargo_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Status Dates */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-b border-[var(--color-glass-border)] pb-1">
                    Status Dates
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Arrived Date
                      </label>
                      <input
                        type="date"
                        className="input-liquid w-full"
                        value={formData.arrived_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            arrived_date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Shipment Date
                      </label>
                      <input
                        type="date"
                        className="input-liquid w-full"
                        value={formData.shipment_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            shipment_date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        User Withdraw Date
                      </label>
                      <input
                        type="date"
                        className="input-liquid w-full"
                        value={formData.user_withdraw_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            user_withdraw_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-[var(--color-glass-border)]">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn-liquid btn-liquid-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-liquid btn-liquid-primary flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {editingOrder ? "Update Order" : "Create Order"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-sm glass-panel p-6 shadow-2xl border border-[var(--color-glass-border)]"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
                  Delete Order?
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-6">
                  Are you sure you want to delete this order? This action cannot
                  be undone.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 btn-liquid btn-liquid-ghost py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 btn-liquid bg-red-500 hover:bg-red-600 text-white py-2.5 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
