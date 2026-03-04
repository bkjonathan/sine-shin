import { OrderWithCustomer } from "./order";

export interface AccountBookRow {
  order: OrderWithCustomer;
  serviceFeeAmount: number;
  productDiscount: number;
  cargoFee: number;
  profit: number;
}

export interface AccountBookTotals {
  totalSales: number;
  totalServiceFee: number;
  totalDiscount: number;
  totalCargoFee: number;
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
  total_service_fee: number;
  total_product_discount: number;
  total_cargo_fee: number;
}

export type AccountTabType = "income" | "expenses" | "summary";
