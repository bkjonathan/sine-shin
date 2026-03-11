import { computeRange, type DateFilterValue } from "../components/pages/dashboard/DashboardDateFilter";
import type { DashboardRecordType } from "../types/dashboard";

const DEFAULT_RANGE = computeRange("this_month");

export const DASHBOARD_DEFAULT_FILTER: DateFilterValue = {
  dateFrom: DEFAULT_RANGE.dateFrom,
  dateTo: DEFAULT_RANGE.dateTo,
  dateField: "order_date",
  preset: "this_month",
};

export const DASHBOARD_RECORD_TYPES = new Set<DashboardRecordType>([
  "profit",
  "cargo",
  "paid_cargo",
  "unpaid_cargo",
]);
