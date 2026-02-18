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
