import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  getDashboardDetailRecords,
  getDashboardShopSettings,
  getDashboardStats,
} from "../api/dashboardApi";
import type {
  DashboardDetailRecord,
  DashboardRecordType,
  DashboardStats,
  ShopData,
} from "../types/dashboard";
import type {
  DateFilterValue,
} from "../components/pages/dashboard/DashboardDateFilter";
import type { DashboardStatus } from "../components/pages/dashboard/DashboardStatusFilter";

export interface UseDashboardDataResult {
  shop: ShopData | null;
  logoSrc: string;
  stats: DashboardStats | null;
  loading: boolean;
  filter: DateFilterValue;
  statusFilter: DashboardStatus;
  modalType: DashboardRecordType | null;
  detailRecords: DashboardDetailRecord[];
  detailLoading: boolean;
  setFilter: (value: DateFilterValue) => void;
  setStatusFilter: (value: DashboardStatus) => void;
  closeModal: () => void;
  openDetailsFor: (type: DashboardRecordType) => Promise<void>;
}

const EMPTY_DETAILS: DashboardDetailRecord[] = [];

const toDashboardStatus = (status: DashboardStatus): string | null => {
  return status === "all" ? null : status;
};

function buildFilterPayload(filter: DateFilterValue): {
  dateFrom: string | null;
  dateTo: string | null;
  dateField: "order_date" | "created_at";
} {
  const dateFrom = (filter.dateFrom || "").trim();
  const dateTo = (filter.dateTo || "").trim();
  const dateField = filter.dateField === "created_at" ? "created_at" : "order_date";

  if (!dateFrom || !dateTo) {
    return { dateFrom: null, dateTo: null, dateField };
  }

  if (dateFrom <= dateTo) {
    return { dateFrom, dateTo, dateField };
  }

  return { dateFrom: dateTo, dateTo: dateFrom, dateField };
}

/**
 * Handles dashboard data loading, filtering, and detail record modal state.
 */
export function useDashboardData(
  initialFilter: DateFilterValue,
): UseDashboardDataResult {
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilterValue>(initialFilter);
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("all");

  const [modalType, setModalType] = useState<DashboardRecordType | null>(null);
  const [detailRecords, setDetailRecords] = useState<DashboardDetailRecord[]>(
    EMPTY_DETAILS,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  const listRequestIdRef = useRef(0);
  const detailsRequestIdRef = useRef(0);

  const loadDashboard = useCallback(
    async (nextFilter: DateFilterValue, nextStatus: DashboardStatus) => {
      const requestId = ++listRequestIdRef.current;
      const payload = buildFilterPayload(nextFilter);

      try {
        setLoading(true);

        const [shopData, dashboardStats] = await Promise.all([
          getDashboardShopSettings(),
          getDashboardStats({ ...payload, status: toDashboardStatus(nextStatus) }),
        ]);

        if (requestId !== listRequestIdRef.current) {
          return;
        }

        setShop(shopData);
        setStats(dashboardStats);
        setLogoSrc(shopData.logo_path ? convertFileSrc(shopData.logo_path) : "");
      } catch {
        if (requestId !== listRequestIdRef.current) {
          return;
        }

        setStats(null);
      } finally {
        if (requestId === listRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadDashboard(filter, statusFilter);
  }, [filter, loadDashboard, statusFilter]);

  const closeModal = useCallback(() => {
    setModalType(null);
    setDetailRecords(EMPTY_DETAILS);
  }, []);

  const openDetailsFor = useCallback(
    async (type: DashboardRecordType) => {
      setModalType(type);
      setDetailLoading(true);

      const requestId = ++detailsRequestIdRef.current;
      const payload = buildFilterPayload(filter);

      try {
        const records = await getDashboardDetailRecords(type, {
          ...payload,
          status: toDashboardStatus(statusFilter),
        });

        if (requestId === detailsRequestIdRef.current) {
          setDetailRecords(records);
        }
      } catch {
        if (requestId === detailsRequestIdRef.current) {
          setDetailRecords(EMPTY_DETAILS);
        }
      } finally {
        if (requestId === detailsRequestIdRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [filter, statusFilter],
  );

  return {
    shop,
    logoSrc,
    stats,
    loading,
    filter,
    statusFilter,
    modalType,
    detailRecords,
    detailLoading,
    setFilter,
    setStatusFilter,
    closeModal,
    openDetailsFor,
  };
}
