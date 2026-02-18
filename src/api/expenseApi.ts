import { invoke } from "@tauri-apps/api/core";
import { Expense, PaginatedExpenses } from "../types/expense";

export const EXPENSE_PAGE_SIZE_LIMITS = {
  min: 5,
  max: 100,
  default: 10,
} as const;

const normalizePageSize = (pageSize?: number | "all"): number => {
  if (pageSize === "all") {
    return -1;
  }

  const requested = pageSize ?? EXPENSE_PAGE_SIZE_LIMITS.default;
  return Math.min(
    EXPENSE_PAGE_SIZE_LIMITS.max,
    Math.max(EXPENSE_PAGE_SIZE_LIMITS.min, requested),
  );
};

const clampPage = (page?: number): number => {
  return Math.max(1, page ?? 1);
};

export type ExpenseSearchKey =
  | "title"
  | "expenseId"
  | "category"
  | "paymentMethod";

export type ExpenseSortBy =
  | "expense_id"
  | "title"
  | "amount"
  | "expense_date"
  | "created_at";

export interface ExpenseSearchParams {
  page?: number;
  pageSize?: number | "all";
  searchKey?: ExpenseSearchKey;
  searchTerm?: string;
  categoryFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: ExpenseSortBy;
  sortOrder?: "asc" | "desc";
}

export const getExpenses = async (): Promise<Expense[]> => {
  return await invoke("get_expenses");
};

export const getExpensesPaginated = async (
  params: ExpenseSearchParams,
): Promise<PaginatedExpenses> => {
  return await invoke("get_expenses_paginated", {
    page: clampPage(params.page),
    pageSize: normalizePageSize(params.pageSize),
    searchKey: params.searchKey,
    searchTerm: params.searchTerm,
    categoryFilter: params.categoryFilter,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
};

export const getExpenseById = async (id: number): Promise<Expense> => {
  return await invoke("get_expense", { id });
};

export const createExpense = async (
  expense: Omit<Expense, "id" | "created_at"> & { id?: number },
): Promise<number> => {
  return await invoke("create_expense", {
    title: expense.title,
    amount: expense.amount,
    category: expense.category,
    expenseDate: expense.expense_date,
    paymentMethod: expense.payment_method,
    notes: expense.notes,
    id: expense.id,
    expenseId: expense.expense_id,
  });
};

export const updateExpense = async (
  expense: Omit<Expense, "created_at" | "expense_id">,
): Promise<void> => {
  return await invoke("update_expense", {
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    category: expense.category,
    expenseDate: expense.expense_date,
    paymentMethod: expense.payment_method,
    notes: expense.notes,
  });
};

export const deleteExpense = async (id: number): Promise<void> => {
  return await invoke("delete_expense", { id });
};
