import { invoke } from "@tauri-apps/api/core";
import { AccountSummary } from "../types/accountBook";

export const getAccountSummary = async (
  dateFrom?: string,
  dateTo?: string,
): Promise<AccountSummary> => {
  return await invoke("get_account_summary", { dateFrom, dateTo });
};
