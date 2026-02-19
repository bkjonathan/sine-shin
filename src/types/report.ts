import { OrderStatus, OrderWithCustomer } from "./order";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export interface EnrichedOrder extends OrderWithCustomer {
  revenue: number;
  serviceFeeAmount: number;
  discountAmount: number;
  profit: number;
  cargoFee: number;
  timelineDate: Date | null;
  city: string;
  platform: string;
  customerLabel: string;
  normalizedStatus: OrderStatus | "unknown";
}

export interface TrendPoint {
  key: string;
  label: string;
  timestamp: number;
  revenue: number;
  profit: number;
  cargoFee: number;
  orders: number;
}

export interface BreakdownRow {
  name: string;
  orders: number;
  revenue: number;
  profit: number;
}

export interface CustomerPerformance {
  key: string;
  name: string;
  city: string;
  platform: string;
  orders: number;
  revenue: number;
  profit: number;
}
