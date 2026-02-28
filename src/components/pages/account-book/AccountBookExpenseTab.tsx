import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import {
  createExpense,
  deleteExpense,
  EXPENSE_PAGE_SIZE_LIMITS,
  ExpenseSearchKey,
  ExpenseSortBy,
  getExpenses,
  getExpensesPaginated,
  updateExpense,
} from "../../../api/expenseApi";
import {
  createEmptyExpenseFormData,
  Expense,
  ExpenseFormData,
  ExpenseFormErrors,
} from "../../../types/expense";
import { useTranslation } from "react-i18next";
import { useSound } from "../../../context/SoundContext";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { formatDate } from "../../../utils/date";
import { Button, Select } from "../../ui";
import ExpenseDeleteModal from "../expenses/ExpenseDeleteModal";
import ExpenseFormModal from "../expenses/ExpenseFormModal";
import {
  IconDollarSign,
  IconDownload,
  IconEdit,
  IconPlus,
  IconSearch,
  IconSortAsc,
  IconSortDesc,
  IconTrash,
  IconLayoutGrid,
  IconList,
} from "../../icons";

const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const EXPENSE_CATEGORIES = [
  "operation",
  "transport",
  "rent",
  "salary",
  "utilities",
  "marketing",
  "other",
] as const;

const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "mobile_wallet",
  "credit",
  "other",
] as const;

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

const toDateOnlyString = (value: Date | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCategoryBadgeClass = (category?: string | null) => {
  switch (category) {
    case "operation":
      return "bg-sky-500/10 text-sky-400 border-sky-500/25";
    case "transport":
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/25";
    case "rent":
      return "bg-amber-500/10 text-amber-400 border-amber-500/25";
    case "salary":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    case "utilities":
      return "bg-cyan-500/10 text-cyan-400 border-cyan-500/25";
    case "marketing":
      return "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25";
    default:
      return "bg-glass-white text-text-secondary border-glass-border";
  }
};

const MAX_EXPENSE_TITLE_LENGTH = 150;
const MAX_EXPENSE_NOTES_LENGTH = 1000;

const hasExpenseFormErrors = (errors: ExpenseFormErrors): boolean => {
  return Object.values(errors).some(Boolean);
};

interface AccountBookExpenseTabProps {
  dateFrom: Date | null;
  dateTo: Date | null;
}

export default function AccountBookExpenseTab({
  dateFrom,
  dateTo,
}: AccountBookExpenseTabProps) {
  const pageSizeOptions: Array<number | "all"> = [5, 10, 20, 50, 100, "all"];
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { playSound } = useSound();
  const { formatPrice } = useAppSettings();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);

  const [currentPage, setCurrentPage] = useState(() =>
    parsePageParam(searchParams.get("page")),
  );
  const [pageSize, setPageSize] = useState<number | "all">(
    EXPENSE_PAGE_SIZE_LIMITS.default,
  );
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [searchKey, setSearchKey] = useState<ExpenseSearchKey>("title");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<ExpenseSortBy>("expense_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    return (
      (localStorage.getItem("expenses_view_mode") as "grid" | "table") ?? "grid"
    );
  });

  const handleSetViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    localStorage.setItem("expenses_view_mode", mode);
  };

  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryMonthTotal, setSummaryMonthTotal] = useState(0);
  const [summaryAverage, setSummaryAverage] = useState(0);

  const latestFetchIdRef = useRef(0);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const displayPages = visiblePages.length > 0 ? visiblePages : ["1"];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ExpenseFormData>(() =>
    createEmptyExpenseFormData(),
  );
  const [formErrors, setFormErrors] = useState<ExpenseFormErrors>({});

  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
    fetchExpenses(currentPage);
  }, [
    currentPage,
    pageSize,
    searchKey,
    searchTerm,
    categoryFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  ]);

  const fetchExpenses = async (page: number) => {
    const fetchId = ++latestFetchIdRef.current;
    const shouldShowInitialLoader = !hasLoadedOnce;

    if (shouldShowInitialLoader) {
      setLoading(true);
    } else {
      setIsPageTransitioning(true);
    }

    try {
      const [pagedData, summaryData] = await Promise.all([
        getExpensesPaginated({
          page,
          pageSize,
          searchKey,
          searchTerm,
          categoryFilter,
          dateFrom: toDateOnlyString(dateFrom),
          dateTo: toDateOnlyString(dateTo),
          sortBy,
          sortOrder,
        }),
        getExpensesPaginated({
          page: 1,
          pageSize: "all",
          searchKey,
          searchTerm,
          categoryFilter,
          dateFrom: toDateOnlyString(dateFrom),
          dateTo: toDateOnlyString(dateTo),
          sortBy,
          sortOrder,
        }),
      ]);

      if (fetchId !== latestFetchIdRef.current) {
        return;
      }

      if (
        page > 1 &&
        pagedData.total_pages > 0 &&
        page > pagedData.total_pages
      ) {
        setCurrentPage(pagedData.total_pages);
        return;
      }
      if (page > 1 && pagedData.total_pages === 0) {
        setCurrentPage(1);
        return;
      }

      setExpenses(pagedData.expenses);
      setTotalExpenses(pagedData.total);
      setTotalPages(pagedData.total_pages);

      const totalAmount = summaryData.expenses.reduce((sum, expense) => {
        return sum + (expense.amount || 0);
      }, 0);

      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();

      const monthAmount = summaryData.expenses.reduce((sum, expense) => {
        const dateValue = expense.expense_date || expense.created_at;
        if (!dateValue) {
          return sum;
        }

        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) {
          return sum;
        }

        if (date.getMonth() === month && date.getFullYear() === year) {
          return sum + (expense.amount || 0);
        }

        return sum;
      }, 0);

      setSummaryTotal(totalAmount);
      setSummaryMonthTotal(monthAmount);
      setSummaryAverage(
        summaryData.expenses.length > 0
          ? totalAmount / summaryData.expenses.length
          : 0,
      );

      setHasLoadedOnce(true);
      setPageTransitionKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setLoading(false);
        setIsPageTransitioning(false);
      }
    }
  };

  const getCategoryLabel = (category?: string | null) => {
    switch (category) {
      case "operation":
        return t("expenses.category_operation");
      case "transport":
        return t("expenses.category_transport");
      case "rent":
        return t("expenses.category_rent");
      case "salary":
        return t("expenses.category_salary");
      case "utilities":
        return t("expenses.category_utilities");
      case "marketing":
        return t("expenses.category_marketing");
      case "other":
        return t("expenses.category_other");
      default:
        return category || t("common.na");
    }
  };

  const getPaymentMethodLabel = (paymentMethod?: string | null) => {
    switch (paymentMethod) {
      case "cash":
        return t("expenses.payment_cash");
      case "bank_transfer":
        return t("expenses.payment_bank_transfer");
      case "mobile_wallet":
        return t("expenses.payment_mobile_wallet");
      case "credit":
        return t("expenses.payment_credit");
      case "other":
        return t("expenses.payment_other");
      default:
        return paymentMethod || t("common.na");
    }
  };

  const categoryOptions = EXPENSE_CATEGORIES.map((category) => ({
    value: category,
    label: getCategoryLabel(category),
  }));

  const paymentMethodOptions = PAYMENT_METHODS.map((paymentMethod) => ({
    value: paymentMethod,
    label: getPaymentMethodLabel(paymentMethod),
  }));

  const validateExpenseForm = (value: ExpenseFormData): ExpenseFormErrors => {
    const errors: ExpenseFormErrors = {};
    const normalizedTitle = value.title.trim();
    const normalizedNotes = value.notes.trim();
    const amount = Number.parseFloat(value.amount);

    if (!normalizedTitle) {
      errors.title = t("expenses.validation.title_required");
    } else if (normalizedTitle.length > MAX_EXPENSE_TITLE_LENGTH) {
      errors.title = t("expenses.validation.title_too_long", {
        max: MAX_EXPENSE_TITLE_LENGTH,
      });
    }

    if (Number.isNaN(amount) || amount < 0) {
      errors.amount = t("expenses.validation.amount_invalid");
    }

    if (normalizedNotes.length > MAX_EXPENSE_NOTES_LENGTH) {
      errors.notes = t("expenses.validation.notes_too_long", {
        max: MAX_EXPENSE_NOTES_LENGTH,
      });
    }

    return errors;
  };

  const handleFormFieldChange = (
    field: keyof ExpenseFormData,
    value: string,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleOpenModal = (expense?: Expense) => {
    setFormErrors({});

    if (expense) {
      setEditingExpense(expense);
      setFormData({
        title: expense.title,
        amount: String(expense.amount ?? ""),
        category: expense.category || "operation",
        expense_date: expense.expense_date || "",
        payment_method: expense.payment_method || "cash",
        notes: expense.notes || "",
      });
    } else {
      setEditingExpense(null);
      setFormData(createEmptyExpenseFormData());
    }
    setIsModalOpen(true);
    playSound("click");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
    setFormErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationErrors = validateExpenseForm(formData);
    setFormErrors(validationErrors);
    if (hasExpenseFormErrors(validationErrors)) {
      playSound("error");
      return;
    }

    const title = formData.title.trim();
    const amount = Number.parseFloat(formData.amount);

    try {
      setIsSubmitting(true);

      if (editingExpense) {
        await updateExpense({
          id: editingExpense.id,
          title,
          amount,
          category: formData.category,
          expense_date: formData.expense_date || undefined,
          payment_method: formData.payment_method,
          notes: formData.notes.trim() || undefined,
        });
      } else {
        await createExpense({
          title,
          amount,
          category: formData.category,
          expense_date: formData.expense_date || undefined,
          payment_method: formData.payment_method,
          notes: formData.notes.trim() || undefined,
        });
      }

      playSound("success");
      await fetchExpenses(currentPage);
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save expense:", error);
      playSound("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) {
      return;
    }

    try {
      await deleteExpense(expenseToDelete.id);
      playSound("success");
      await fetchExpenses(currentPage);
      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
    } catch (error) {
      console.error("Failed to delete expense:", error);
      playSound("error");
    }
  };

  const handleExport = async () => {
    try {
      const allExpenses = await getExpenses();
      if (!allExpenses || allExpenses.length === 0) {
        playSound("error");
        alert(t("expenses.no_expenses"));
        return;
      }

      const headers = [
        "ID",
        "Expense ID",
        "Title",
        "Amount",
        "Category",
        "Payment Method",
        "Expense Date",
        "Notes",
        "Created At",
      ];

      const escapeCsv = (value: string | number | null | undefined) => {
        const stringValue = String(value ?? "");
        return `"${stringValue.replace(/"/g, '""')}"`;
      };

      const rows = [...allExpenses]
        .sort((a, b) => a.id - b.id)
        .map((expense) => {
          return [
            expense.id,
            expense.expense_id || "",
            expense.title,
            expense.amount,
            getCategoryLabel(expense.category),
            getPaymentMethodLabel(expense.payment_method),
            expense.expense_date || "",
            expense.notes || "",
            expense.created_at || "",
          ]
            .map((cell) => escapeCsv(cell))
            .join(",");
        });

      const csvContent = [
        headers.map((value) => `"${value}"`).join(","),
        ...rows,
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);

      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `expenses_export_${date}.csv`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      playSound("success");
    } catch (error) {
      console.error("Failed to export expenses:", error);
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
      <motion.div
        variants={fadeVariants}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">
            {t("expenses.records_title", "Expense Records")}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {t("expenses.records_subtitle", "Manage your business expenses")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden sm:flex bg-glass-white border border-glass-border rounded-lg p-1 gap-1 mr-1">
            <button
              onClick={() => handleSetViewMode("grid")}
              className={`p-1.5 rounded flex items-center justify-center transition-all duration-200 ${
                viewMode === "grid"
                  ? "bg-accent-blue text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary hover:bg-glass-white"
              }`}
              title="Grid View"
            >
              <IconLayoutGrid size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => handleSetViewMode("table")}
              className={`p-1.5 rounded flex items-center justify-center transition-all duration-200 ${
                viewMode === "table"
                  ? "bg-accent-blue text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary hover:bg-glass-white"
              }`}
              title="Table View"
            >
              <IconList size={16} strokeWidth={2} />
            </button>
          </div>
          <Button
            onClick={handleExport}
            variant="ghost"
            className="px-4 py-2 text-sm flex items-center gap-2"
          >
            <IconDownload size={16} strokeWidth={2} />
            {t("expenses.export_csv")}
          </Button>
          <Button
            onClick={() => handleOpenModal()}
            variant="primary"
            className="px-4 py-2 text-sm flex items-center gap-2"
          >
            <IconPlus size={16} strokeWidth={2} />
            {t("expenses.add_expense")}
          </Button>
        </div>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("expenses.total_records")}
          </p>
          <p className="text-xl font-bold text-text-primary mt-2">
            {totalExpenses.toLocaleString()}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("expenses.total_amount")}
          </p>
          <p className="text-xl font-bold text-rose-400 mt-2">
            {formatPrice(summaryTotal)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("expenses.this_month")}
          </p>
          <p className="text-xl font-bold text-text-primary mt-2">
            {formatPrice(summaryMonthTotal)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("expenses.average_amount")}
          </p>
          <p className="text-xl font-bold text-text-primary mt-2">
            {formatPrice(summaryAverage)}
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeVariants} className="mb-6">
        <div className="glass-panel p-4 border border-glass-border-light relative z-20">
          <div className="flex flex-col gap-3">
            {/* Top Row: Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <div className="input-liquid w-full flex items-center p-0 overflow-hidden focus-within:border-accent-blue focus-within:ring-1 focus-within:ring-accent-blue/50">
                  <div className="pl-3 flex items-center pointer-events-none z-10">
                    <IconSearch
                      className="h-4 w-4 text-text-muted"
                      strokeWidth={2}
                    />
                  </div>
                  <input
                    type="text"
                    className="flex-1 bg-transparent border-none pl-2 pr-4 py-2.5 text-text-primary placeholder:text-text-muted focus:ring-0 text-sm h-full w-full outline-none"
                    placeholder={t("expenses.search_placeholder")}
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  <div className="h-6 w-px bg-glass-border shrink-0" />
                  <select
                    className="bg-transparent border-none text-text-secondary hover:text-text-primary focus:ring-0 text-sm py-2.5 pr-8 pl-3 cursor-pointer outline-none appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-position-[right_8px_center] bg-size-[14px_14px] shrink-0 max-w-[140px] truncate"
                    value={searchKey}
                    onChange={(e) => {
                      setSearchKey(e.target.value as ExpenseSearchKey);
                      setCurrentPage(1);
                    }}
                  >
                    <option
                      value="title"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.search_key_title")}
                    </option>
                    <option
                      value="expenseId"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.search_key_expense_id")}
                    </option>
                    <option
                      value="category"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.search_key_category")}
                    </option>
                    <option
                      value="paymentMethod"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.search_key_payment_method")}
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex items-center shrink-0 w-full sm:w-64 max-w-full">
                <div className="input-liquid w-full flex items-center p-0 overflow-hidden focus-within:border-accent-blue focus-within:ring-1 focus-within:ring-accent-blue/50">
                  <select
                    className="flex-1 bg-transparent border-none text-text-primary focus:ring-0 text-sm py-2.5 pl-3 pr-8 cursor-pointer outline-none appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-position-[right_8px_center] bg-size-[14px_14px] truncate"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as ExpenseSortBy);
                      setCurrentPage(1);
                    }}
                  >
                    <option
                      value="expense_date"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.sort_by_date")}
                    </option>
                    <option
                      value="expense_id"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.sort_by_id")}
                    </option>
                    <option
                      value="title"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.sort_by_title")}
                    </option>
                    <option
                      value="amount"
                      className="bg-glass-surface text-text-primary"
                    >
                      {t("expenses.sort_by_amount")}
                    </option>
                  </select>

                  <div className="h-6 w-px bg-glass-border shrink-0" />

                  <button
                    onClick={() =>
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                    }
                    className="h-full px-3 shrink-0 text-text-secondary hover:text-text-primary hover:bg-glass-white/5 transition-colors flex items-center justify-center focus:outline-none"
                    title={sortOrder === "asc" ? "Ascending" : "Descending"}
                  >
                    {sortOrder === "asc" ? (
                      <IconSortAsc size={18} strokeWidth={2} />
                    ) : (
                      <IconSortDesc size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: Additional Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full relative z-20">
              <Select
                options={[
                  { value: "all", label: t("common.all") },
                  ...categoryOptions,
                ]}
                value={categoryFilter}
                onChange={(value) => {
                  setCategoryFilter(value.toString());
                  setCurrentPage(1);
                }}
                placeholder={t("expenses.category")}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
            </div>
          ) : expenses.length === 0 ? (
            isPageTransitioning ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            ) : (
              <div className="text-center py-20 bg-glass-white rounded-xl border border-glass-border">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-white-hover flex items-center justify-center text-text-muted">
                  <IconDollarSign size={32} strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-medium text-text-primary">
                  {t("expenses.no_expenses")}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {searchInput.trim() || categoryFilter !== "all"
                    ? t("expenses.no_expenses_search")
                    : t("expenses.no_expenses_create")}
                </p>
              </div>
            )
          ) : (
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                {viewMode === "grid" ? (
                  <motion.div
                    key={`grid-${pageTransitionKey}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6"
                  >
                    <AnimatePresence mode="popLayout">
                      {expenses.map((expense) => (
                        <motion.div
                          key={expense.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="glass-panel p-5 group hover:border-accent-blue/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent-blue/5 relative overflow-hidden"
                        >
                          <div className="relative z-10">
                            <div className="flex justify-between items-start mb-3">
                              <div className="bg-glass-white px-2 py-1 rounded text-xs font-mono text-text-secondary border border-glass-border">
                                {expense.expense_id || `#${expense.id}`}
                              </div>

                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mr-2 -mt-2">
                                <button
                                  onClick={() => handleOpenModal(expense)}
                                  className="p-2 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded-lg transition-colors"
                                  title={t("expenses.edit")}
                                >
                                  <IconEdit size={16} strokeWidth={2} />
                                </button>
                                <button
                                  onClick={() => {
                                    setExpenseToDelete(expense);
                                    setIsDeleteModalOpen(true);
                                  }}
                                  className="p-2 text-text-muted hover:text-error hover:bg-red-500/10 rounded-lg transition-colors"
                                  title={t("expenses.delete")}
                                >
                                  <IconTrash size={16} strokeWidth={2} />
                                </button>
                              </div>
                            </div>

                            <h3 className="font-semibold text-text-primary text-lg mb-1 line-clamp-1">
                              {expense.title}
                            </h3>
                            <p className="text-xs text-text-muted mb-4">
                              {formatDate(
                                expense.expense_date || expense.created_at,
                              )}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mb-4">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getCategoryBadgeClass(
                                  expense.category,
                                )}`}
                              >
                                {getCategoryLabel(expense.category)}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-glass-border bg-glass-white px-2.5 py-1 text-xs text-text-secondary">
                                {getPaymentMethodLabel(expense.payment_method)}
                              </span>
                            </div>

                            <p className="text-xl font-bold text-rose-300 mb-2">
                              {formatPrice(expense.amount || 0)}
                            </p>

                            <p className="text-sm text-text-secondary line-clamp-2 min-h-[40px]">
                              {expense.notes || t("expenses.no_notes")}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`table-${pageTransitionKey}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="glass-panel overflow-hidden border border-glass-border shadow-sm mb-6"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-glass-border/50 bg-glass-surface/50">
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                              {t("expenses.sort_by_id")}
                            </th>
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                              {t("expenses.sort_by_title")}
                            </th>
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                              {t("expenses.sort_by_date")}
                            </th>
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                              {t("expenses.category")}
                            </th>
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted text-right whitespace-nowrap">
                              {t("expenses.sort_by_amount")}
                            </th>
                            <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-text-muted text-right whitespace-nowrap">
                              {t("common.actions")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence mode="popLayout">
                            {expenses.map((expense) => (
                              <motion.tr
                                key={expense.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="group border-b border-glass-border/30 last:border-0 hover:bg-glass-white/5 transition-colors"
                              >
                                <td className="py-3 px-4 text-sm font-mono text-text-secondary whitespace-nowrap">
                                  {expense.expense_id || `#${expense.id}`}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-primary line-clamp-1">
                                      {expense.title}
                                    </span>
                                    {expense.notes && (
                                      <span className="text-xs text-text-muted line-clamp-1 mt-0.5">
                                        {expense.notes}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-sm text-text-secondary whitespace-nowrap">
                                  {formatDate(
                                    expense.expense_date || expense.created_at,
                                  )}
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getCategoryBadgeClass(
                                      expense.category,
                                    )}`}
                                  >
                                    {getCategoryLabel(expense.category)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-sm font-bold text-rose-300 text-right whitespace-nowrap">
                                  {formatPrice(expense.amount || 0)}
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button
                                      onClick={() => handleOpenModal(expense)}
                                      className="p-1.5 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded transition-colors"
                                      title={t("expenses.edit")}
                                    >
                                      <IconEdit size={16} strokeWidth={2} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setExpenseToDelete(expense);
                                        setIsDeleteModalOpen(true);
                                      }}
                                      className="p-1.5 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                      title={t("expenses.delete")}
                                    >
                                      <IconTrash size={16} strokeWidth={2} />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
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
                {t("expenses.total_results", { count: totalExpenses })}
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
                <Button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={
                    isPageTransitioning || currentPage <= 1 || totalPages === 0
                  }
                  variant="ghost"
                  className="px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.previous")}
                </Button>
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
                  {t("expenses.page_status", {
                    page: totalPages === 0 ? 0 : currentPage,
                    total: totalPages,
                  })}
                </span>
                <Button
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
                  variant="ghost"
                  className="px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <ExpenseFormModal
        isOpen={isModalOpen}
        editingExpense={editingExpense}
        formData={formData}
        formErrors={formErrors}
        categoryOptions={categoryOptions}
        paymentMethodOptions={paymentMethodOptions}
        isSubmitting={isSubmitting}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        onFieldChange={handleFormFieldChange}
      />

      <ExpenseDeleteModal
        isOpen={isDeleteModalOpen}
        expense={expenseToDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setExpenseToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </motion.div>
  );
}
