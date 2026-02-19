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
