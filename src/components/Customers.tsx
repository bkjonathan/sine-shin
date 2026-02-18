import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  getCustomers,
  getCustomersPaginated,
  CUSTOMER_PAGE_SIZE_LIMITS,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../api/customerApi";
import { Customer } from "../types/customer";
import { useSound } from "../context/SoundContext";
import { useTranslation } from "react-i18next";
import { Select } from "./ui/Select";
import { parseCSV } from "../utils/csvUtils";

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

const getVisiblePages = (currentPage: number, totalPages: number): string[] => {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => String(i + 1));
  }

  const pages: string[] = ["1"];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("...");
  }

  for (let page = start; page <= end; page++) {
    pages.push(String(page));
  }

  if (end < totalPages - 1) {
    pages.push("...");
  }

  pages.push(String(totalPages));
  return pages;
};

const parsePageParam = (value: string | null): number => {
  const parsedPage = Number.parseInt(value ?? "1", 10);

  if (Number.isNaN(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
};

const getCustomersListPath = (page: number): string => {
  return page > 1 ? `/customers?page=${page}` : "/customers";
};

export default function Customers() {
  const pageSizeOptions: Array<number | "all"> = [5, 10, 20, 50, 100, "all"];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(() =>
    parsePageParam(searchParams.get("page")),
  );
  const [pageSize, setPageSize] = useState<number | "all">(
    CUSTOMER_PAGE_SIZE_LIMITS.default,
  );
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchKey, setSearchKey] = useState<"name" | "customerId" | "phone">(
    "name",
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "customer_id" | "created_at">(
    "customer_id",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const { playSound } = useSound();
  const { t } = useTranslation();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    social_media_url: "",
    platform: "",
  });

  // Delete State
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestFetchIdRef = useRef(0);
  const [isImporting, setIsImporting] = useState(false);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const displayPages = visiblePages.length > 0 ? visiblePages : ["1"];

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (currentPage > 1) {
      nextSearchParams.set("page", String(currentPage));
    } else {
      nextSearchParams.delete("page");
    }

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [currentPage, searchParams, setSearchParams]);

  useEffect(() => {
    fetchCustomers(currentPage);
  }, [currentPage, pageSize, searchKey, searchTerm, sortBy, sortOrder]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input value so the same file can be selected again if needed
    event.target.value = "";

    try {
      setIsImporting(true);
      const text = await file.text();
      const records = parseCSV(text);

      if (records.length === 0) {
        playSound("error");
        alert(
          t("customers.import.no_records") || "No valid records found in CSV",
        );
        return;
      }

      console.log("Parsed CSV Records:", records); // Debug log

      let successCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];

      for (const record of records) {
        // Map CSV headers to Customer object keys (case-insensitive check)
        // Expected headers: Name, Phone, Address, City, Platform, Social URL
        // We look for these keys in the record object

        const getValue = (key: string) => {
          const foundKey = Object.keys(record).find(
            (k) => k.toLowerCase() === key.toLowerCase(),
          );
          return foundKey ? record[foundKey] : "";
        };

        const name = getValue("name");

        if (!name) {
          console.warn("Skipping record without name:", record);
          errorCount++;
          errorDetails.push(`Row without name: ${JSON.stringify(record)}`);
          continue;
        }

        const toTitleCase = (str: string) => {
          return str.replace(
            /\w\S*/g,
            (txt) =>
              txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
          );
        };

        const customerData: any = {
          name: name,
          phone: getValue("phone"),
          address: getValue("address"),
          city: getValue("city"),
          social_media_url:
            getValue("social url") ||
            getValue("social_media_url") ||
            getValue("social_url"),
          platform: getValue("platform")
            ? toTitleCase(getValue("platform"))
            : "",
        };

        // Extract ID if present (for restoration/migration)
        const idStr = getValue("id");
        if (idStr && !isNaN(parseInt(idStr))) {
          customerData.id = parseInt(idStr);
        }

        // Extract Customer ID if present
        const customerId = getValue("customer id") || getValue("customer_id");
        if (customerId) {
          customerData.customer_id = customerId;
        }

        try {
          await createCustomer(customerData);
          successCount++;
        } catch (e) {
          console.error("Failed to import customer:", name, e);
          errorCount++;
          errorDetails.push(`Failed to import '${name}': ${e}`);
        }
      }

      playSound(successCount > 0 ? "success" : "error");
      await fetchCustomers(currentPage);

      // Detailed feedback
      let message = `Import complete.\nSuccess: ${successCount}\nFailed: ${errorCount}`;
      if (errorCount > 0) {
        message += "\n\nCheck console for details.";
        console.error("Import Errors:", errorDetails);
      }
      alert(message);
    } catch (error) {
      console.error("Failed to parse CSV:", error);
      playSound("error");
      alert("Failed to parse CSV file");
    } finally {
      setIsImporting(false);
    }
  };

  const fetchCustomers = async (page: number) => {
    const fetchId = ++latestFetchIdRef.current;
    const shouldShowInitialLoader = !hasLoadedOnce;

    if (shouldShowInitialLoader) {
      setLoading(true);
    } else {
      setIsPageTransitioning(true);
    }

    try {
      const data = await getCustomersPaginated({
        page,
        pageSize,
        searchKey,
        searchTerm,
        sortBy,
        sortOrder,
      });

      if (fetchId !== latestFetchIdRef.current) {
        return;
      }

      // If current page is out of range after delete/filter, jump to last valid page.
      if (page > 1 && data.total_pages > 0 && page > data.total_pages) {
        setCurrentPage(data.total_pages);
        return;
      }
      if (page > 1 && data.total_pages === 0) {
        setCurrentPage(1);
        return;
      }

      setCustomers(data.customers);
      setTotalCustomers(data.total);
      setTotalPages(data.total_pages);
      setHasLoadedOnce(true);
      setPageTransitionKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setLoading(false);
        setIsPageTransitioning(false);
      }
    }
  };

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        social_media_url: customer.social_media_url || "",
        platform: customer.platform || "",
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: "",
        phone: "",
        address: "",
        city: "",
        social_media_url: "",
        platform: "",
      });
    }
    setIsModalOpen(true);
    playSound("click");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setIsSubmitting(true);
      if (editingCustomer) {
        await updateCustomer({
          ...editingCustomer,
          ...formData,
        });
      } else {
        await createCustomer(formData);
      }
      playSound("success");
      await fetchCustomers(currentPage);
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save customer:", error);
      playSound("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await deleteCustomer(customerToDelete.id);
      playSound("success");
      await fetchCustomers(currentPage);
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      console.error("Failed to delete customer:", error);
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
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t("customers.title")}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("customers.manage_customers")}
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="btn-liquid btn-liquid-ghost px-4 py-2 text-sm flex items-center gap-2"
          >
            {isImporting ? (
              <div className="w-4 h-4 border-2 border-text-secondary border-t-text-primary rounded-full animate-spin" />
            ) : (
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {t("customers.import_csv")}
          </button>
          <button
            onClick={async () => {
              try {
                const allCustomers = await getCustomers();
                if (!allCustomers || allCustomers.length === 0) {
                  return;
                }

                // 2. Define headers
                const headers = [
                  "ID",
                  "Customer ID",
                  "Name",
                  "Phone",
                  "Address",
                  "City",
                  "Platform",
                  "Social URL",
                  "Created At",
                ];

                // 3. Format data rows
                // Sort customers by ID ascending (1, 2, 3...)
                const sortedCustomers = [...allCustomers].sort(
                  (a, b) => a.id - b.id,
                );

                const csvRows = sortedCustomers.map((c) => {
                  return [
                    c.id,
                    c.customer_id || "-",
                    `"${c.name.replace(/"/g, '""')}"`, // Handle quotes in names
                    c.phone ? `"${c.phone}"` : "-",
                    c.address ? `"${c.address.replace(/"/g, '""')}"` : "-",
                    c.city ? `"${c.city}"` : "-",
                    c.platform || "-",
                    c.social_media_url || "-",
                    c.created_at || "-",
                  ].join(",");
                });

                // 4. Combine headers and rows
                const csvContent = [headers.join(","), ...csvRows].join("\n");

                // 5. Create blob and download link
                const blob = new Blob([csvContent], {
                  type: "text/csv;charset=utf-8;",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);

                // Format filename: customers_export_YYYY-MM-DD.csv
                const date = new Date().toISOString().split("T")[0];
                link.setAttribute("download", `customers_export_${date}.csv`);

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                playSound("success");
              } catch (error) {
                console.error("Failed to export CSV:", error);
                playSound("error");
              }
            }}
            className="btn-liquid btn-liquid-ghost px-4 py-2 text-sm flex items-center gap-2"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t("customers.export_csv")}
          </button>
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
            {t("customers.add_customer")}
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-end md:items-center"
      >
        <div className="flex flex-col md:flex-row gap-3 max-w-2xl flex-1">
          <div className="w-full md:w-56">
            <Select
              options={[
                { value: "name", label: t("customers.search_key_name") },
                {
                  value: "customerId",
                  label: t("customers.search_key_customer_id"),
                },
                { value: "phone", label: t("customers.search_key_phone") },
              ]}
              value={searchKey}
              onChange={(value) => {
                setSearchKey(value as "name" | "customerId" | "phone");
                setCurrentPage(1);
              }}
              placeholder={t("customers.search_by")}
            />
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-4 w-4 text-text-muted"
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
              placeholder={t("customers.search_placeholder")}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        {/* Sorting Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-48">
            <Select
              options={[
                { value: "customer_id", label: "Sort by ID" },
                { value: "name", label: "Sort by Name" },
                { value: "created_at", label: "Sort by Date" },
              ]}
              value={sortBy}
              onChange={(value) => {
                setSortBy(value as "name" | "customer_id" | "created_at");
                setCurrentPage(1);
              }}
            />
          </div>
          <button
            onClick={() =>
              setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
            }
            className="p-2.5 rounded-lg bg-glass-white border border-glass-border hover:bg-glass-white-hover transition-colors text-text-secondary"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? (
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
                <path d="m3 9 4-5 4 5" />
                <path d="M7 4v16" />
                <path d="M12 12h4" />
                <path d="M12 16h7" />
                <path d="M12 20h10" />
              </svg>
            ) : (
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
                <path d="m3 16 4 5 4-5" />
                <path d="M7 21V5" />
                <path d="M12 5h10" />
                <path d="M12 9h7" />
                <path d="M12 13h4" />
              </svg>
            )}
          </button>
        </div>
      </motion.div>

      {/* ── Customer List ── */}
      <motion.div
        variants={fadeVariants}
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
            </div>
          ) : customers.length === 0 ? (
            isPageTransitioning ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            ) : (
              <div className="text-center py-20 bg-glass-white rounded-xl border border-glass-border">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-white-hover flex items-center justify-center text-text-muted">
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
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-text-primary">
                  {t("customers.no_customers")}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {searchInput.trim()
                    ? t("customers.no_customers_search")
                    : t("customers.no_customers_create")}
                </p>
              </div>
            )
          ) : (
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pageTransitionKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4"
                >
                  <AnimatePresence mode="popLayout">
                    {customers.map((customer) => (
                      <motion.div
                        key={customer.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() =>
                          navigate(`/customers/${customer.id}`, {
                            state: {
                              returnTo: getCustomersListPath(currentPage),
                            },
                          })
                        }
                        className="glass-panel p-5 group hover:border-accent-blue/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent-blue/5 relative overflow-hidden cursor-pointer"
                      >
                        {/* Decorative background gradient on hover */}
                        <div className="absolute inset-0 bg-linear-to-br from-accent-blue/0 to-accent-purple/0 group-hover:from-accent-blue/5 group-hover:to-accent-purple/5 transition-all duration-500 pointer-events-none" />

                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-start gap-3.5">
                              {/* Avatar */}
                              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-glass-white to-glass-white-hover border border-glass-border flex items-center justify-center text-text-primary font-bold text-lg shadow-sm group-hover:scale-105 transition-transform duration-300">
                                {customer.name.charAt(0).toUpperCase()}
                              </div>

                              {/* Name & Meta */}
                              <div>
                                <h3 className="font-semibold text-text-primary text-lg leading-tight group-hover:text-accent-blue transition-colors">
                                  {customer.name}
                                </h3>

                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                  {customer.customer_id && (
                                    <span className="text-[10px] font-mono text-text-secondary bg-glass-white-hover px-2 py-0.5 rounded border border-glass-border opacity-80 group-hover:opacity-100 transition-opacity">
                                      {customer.customer_id}
                                    </span>
                                  )}
                                  {customer.platform && (
                                    <span className="text-[10px] font-medium text-text-muted bg-glass-white px-2 py-0.5 rounded-full border border-glass-border">
                                      {customer.platform}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mr-2 -mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenModal(customer);
                                }}
                                className="p-2 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded-lg transition-colors"
                                title="Edit"
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerToDelete(customer);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-2 text-text-muted hover:text-error hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Delete"
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

                          {/* Divider */}
                          <div className="h-px w-full bg-linear-to-r from-transparent via-glass-border to-transparent mb-3 opacity-50" />

                          {/* Contact Info */}
                          <div className="space-y-2.5">
                            {customer.phone ? (
                              <div className="flex items-center gap-2.5 text-sm group/phone">
                                <div className="p-1.5 rounded-md bg-glass-white text-text-muted group-hover/phone:text-accent-blue transition-colors">
                                  <svg
                                    className="w-3.5 h-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                  </svg>
                                </div>
                                <span className="text-text-secondary font-medium">
                                  {customer.phone}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5 text-sm opacity-40">
                                <div className="p-1.5 rounded-md bg-glass-white text-text-muted">
                                  <svg
                                    className="w-3.5 h-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                  </svg>
                                </div>
                                <span className="text-text-muted italic">
                                  {t("customers.no_phone")}
                                </span>
                              </div>
                            )}

                            {customer.address || customer.city ? (
                              <div className="flex items-start gap-2.5 text-sm group/addr">
                                <div className="p-1.5 mt-0.5 rounded-md bg-glass-white text-text-muted group-hover/addr:text-accent-purple transition-colors shrink-0">
                                  <svg
                                    className="w-3.5 h-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                </div>
                                <span className="text-text-secondary line-clamp-2 leading-snug">
                                  {[customer.address, customer.city]
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5 text-sm opacity-40">
                                <div className="p-1.5 rounded-md bg-glass-white text-text-muted">
                                  <svg
                                    className="w-3.5 h-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                </div>
                                <span className="text-text-muted italic">
                                  {t("customers.no_address")}
                                </span>
                              </div>
                            )}

                            {customer.social_media_url && (
                              <div className="pt-1">
                                <a
                                  href={customer.social_media_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-cyan font-medium transition-colors bg-accent-blue/5 hover:bg-accent-blue/10 px-2.5 py-1.5 rounded-md w-full justify-center group/link"
                                >
                                  <svg
                                    className="w-3.5 h-3.5 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                  </svg>
                                  {t("customers.visit_social")}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {isPageTransitioning && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none rounded-xl bg-glass-white/20 backdrop-blur-[1px] flex items-center justify-center"
                  >
                    <div className="w-7 h-7 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {!loading && (
          <div className="mt-4 rounded-xl border border-glass-border-light bg-glass-white-hover shadow-[0_10px_24px_rgba(0,0,0,0.2)] backdrop-blur-md p-3 md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-text-secondary">
                {t("customers.total_results", { count: totalCustomers })}
              </p>
              <div className="flex items-center gap-2 flex-wrap md:justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">
                    {t("common.per_page")}
                  </span>
                  <Select
                    className="w-28"
                    options={pageSizeOptions.map((size) => ({
                      value: size,
                      label: size === "all" ? t("common.all") : String(size),
                    }))}
                    value={pageSize}
                    menuPlacement="top"
                    onChange={(value) => {
                      const nextPageSize =
                        value === "all" ? "all" : Number(value);
                      if (
                        nextPageSize !== "all" &&
                        Number.isNaN(nextPageSize)
                      ) {
                        return;
                      }
                      setPageSize(nextPageSize);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={
                    isPageTransitioning || currentPage <= 1 || totalPages === 0
                  }
                  className="btn-liquid btn-liquid-ghost px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.previous")}
                </button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-full py-1">
                  {displayPages.map((item, index) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-sm font-medium text-text-muted"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() =>
                          totalPages > 0 && setCurrentPage(parseInt(item, 10))
                        }
                        disabled={isPageTransitioning || totalPages === 0}
                        className={`min-w-9 px-3 py-2 text-sm rounded-lg transition-colors ${
                          parseInt(item, 10) === currentPage && totalPages > 0
                            ? "bg-accent-blue text-white shadow-md"
                            : "border border-glass-border-light bg-glass-white text-text-primary hover:bg-glass-white-hover"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <span className="text-sm text-text-secondary px-1">
                  {t("customers.page_status", {
                    page: totalPages === 0 ? 0 : currentPage,
                    total: totalPages,
                  })}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) =>
                      totalPages === 0 ? 1 : Math.min(totalPages, prev + 1),
                    )
                  }
                  disabled={
                    isPageTransitioning ||
                    totalPages === 0 ||
                    currentPage >= totalPages
                  }
                  className="btn-liquid btn-liquid-ghost px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
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
              className="relative w-full max-w-lg glass-panel p-6 shadow-2xl border border-glass-border"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary">
                  {editingCustomer
                    ? t("customers.modal.title_edit")
                    : t("customers.modal.title_add")}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
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

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.name")}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      className="input-liquid w-full"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.phone")}
                    </label>
                    <input
                      type="tel"
                      className="input-liquid w-full"
                      placeholder="0912345678"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.platform")}
                    </label>
                    <div className="relative z-20">
                      <Select
                        options={[
                          { value: "Facebook", label: "Facebook" },
                          { value: "TikTok", label: "TikTok" },
                          { value: "Others", label: t("common.others") },
                        ]}
                        value={formData.platform}
                        onChange={(val) => {
                          const platform = val.toString();
                          let socialUrl = formData.social_media_url;

                          if (platform === "Facebook") {
                            socialUrl = "https://facebook.com";
                          } else if (platform === "TikTok") {
                            socialUrl = "https://tiktok.com";
                          } else if (platform === "Others") {
                            socialUrl = "-";
                          }

                          setFormData({
                            ...formData,
                            platform,
                            social_media_url: socialUrl,
                          });
                        }}
                        placeholder={t("customers.form.select_platform")}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.city")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full"
                      placeholder="Yangon"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.social_url")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full"
                      placeholder="https://facebook.com/..."
                      value={formData.social_media_url}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          social_media_url: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {t("customers.form.address")}
                    </label>
                    <textarea
                      className="input-liquid w-full min-h-[80px]"
                      placeholder="Full address..."
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn-liquid btn-liquid-ghost"
                  >
                    {t("customers.modal.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-liquid btn-liquid-primary flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {editingCustomer
                      ? t("customers.modal.update")
                      : t("customers.modal.create")}
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
              className="relative w-full max-w-sm glass-panel p-6 shadow-2xl border border-glass-border"
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
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">
                  {t("customers.delete_modal.title")}
                </h3>
                <p className="text-sm text-text-muted mb-6">
                  {t("customers.delete_modal.message_part1")}
                  <span className="font-semibold text-text-primary">
                    {customerToDelete?.name}
                  </span>
                  {t("customers.delete_modal.message_part2")}
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 btn-liquid btn-liquid-ghost py-2.5 text-sm"
                  >
                    {t("customers.modal.cancel")}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 btn-liquid bg-red-500 hover:bg-red-600 text-white py-2.5 text-sm"
                  >
                    {t("customers.delete_modal.delete")}
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
