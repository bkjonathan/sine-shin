export interface ParcelPrintOptions {
  showCustomerName: boolean;
  showCustomerId: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showProductDetails: boolean;
  showOrderId: boolean;
  showShopName: boolean;
}

export interface ParcelPrintLabelItem {
  label: string;
  qty?: number | null;
}

export interface ParcelPrintLabel {
  key: string;
  kind: "order" | "customer";
  orderId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  items?: ParcelPrintLabelItem[];
  totalQty?: number | null;
  totalWeight?: number | null;
}

export interface ParcelPrintQueueItem extends ParcelPrintLabel {
  copies: number;
}
