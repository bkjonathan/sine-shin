import { invoke } from "@tauri-apps/api/core";

export const printInvoiceDirect = async (
  bytes: number[],
  printerName: string | null,
): Promise<void> => {
  return invoke("print_invoice_direct", { bytes, printerName });
};

export const printWindow = async (): Promise<void> => {
  return invoke("print_window");
};
