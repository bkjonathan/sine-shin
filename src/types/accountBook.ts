import { OrderWithCustomer } from "./order";

export interface AccountBookRow {
  order: OrderWithCustomer;
  serviceFeeAmount: number;
  productDiscount: number;
  profit: number;
}

export interface AccountBookTotals {
  totalSales: number;
  totalServiceFee: number;
  totalDiscount: number;
  totalProfit: number;
}

export interface AccountSummary {
  total_income: number;
  total_expenses: number;
  net_balance: number;
  total_orders: number;
  total_expense_records: number;
  this_month_income: number;
  this_month_expenses: number;
}

export type AccountTabType = "income" | "expenses" | "summary";
