import { invoke } from "@tauri-apps/api/core";

import type {
  DashboardDetailRecord,
  DashboardRecordType,
  DashboardStats,
  ShopData,
} from "../types/dashboard";

export interface DashboardFilterPayload {
  dateFrom: string | null;
  dateTo: string | null;
  dateField: "order_date" | "created_at";
  status: string | null;
}

export const getDashboardShopSettings = async (): Promise<ShopData> => {
  return invoke<ShopData>("get_shop_settings");
};

export const getDashboardStats = async (
  payload: DashboardFilterPayload,
): Promise<DashboardStats> => {
  return invoke<DashboardStats>("get_dashboard_stats", {
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    dateField: payload.dateField,
    status: payload.status,
  });
};

export const getDashboardDetailRecords = async (
  recordType: DashboardRecordType,
  payload: DashboardFilterPayload,
): Promise<DashboardDetailRecord[]> => {
  return invoke<DashboardDetailRecord[]>("get_dashboard_detail_records", {
    recordType,
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    dateField: payload.dateField,
    status: payload.status,
  });
};
