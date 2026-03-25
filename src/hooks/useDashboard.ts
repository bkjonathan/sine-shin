import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { useTabNavigation } from "./useTabNavigation";

export interface UseDashboardResult {
  formatPrice: (value: number) => string;
  navigateInTab: (path: string) => void;
  navigateToOrders: () => void;
  navigateToOrder: (id: string) => void;
  handleLogout: () => void;
}

/**
 * Composes Dashboard-specific app wiring (auth, settings, tab navigation)
 * into a single hook so page components stay focused on presentation/data.
 */
export function useDashboard(): UseDashboardResult {
  const { formatPrice } = useAppSettings();
  const { logout } = useAuth();
  const { navigateInTab } = useTabNavigation();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const navigateToOrders = useCallback(() => {
    navigateInTab("/orders");
  }, [navigateInTab]);

  const navigateToOrder = useCallback(
    (id: string) => {
      navigateInTab(`/orders/${id}`);
    },
    [navigateInTab],
  );

  return {
    formatPrice,
    navigateInTab,
    navigateToOrders,
    navigateToOrder,
    handleLogout,
  };
}
