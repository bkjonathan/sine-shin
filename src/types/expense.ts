export interface Expense {
  id: number;
  expense_id?: string | null;
  title: string;
  amount: number;
  category?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  expense_date?: string | null;
  created_at?: string | null;
}

export interface PaginatedExpenses {
  expenses: Expense[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ExpenseFormData {
  title: string;
  amount: string;
  category: string;
  expense_date: string;
  payment_method: string;
  notes: string;
}

export type ExpenseFormErrors = Partial<Record<keyof ExpenseFormData, string>>;

export const createEmptyExpenseFormData = (): ExpenseFormData => ({
  title: "",
  amount: "",
  category: "operation",
  expense_date: "",
  payment_method: "cash",
  notes: "",
});
