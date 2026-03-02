import { invoke } from "@tauri-apps/api/core";

export interface ShopSettings {
  id: number;
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  logo_cloud_url: string | null;
  customer_id_prefix: string | null;
  order_id_prefix: string | null;
  created_at: string | null;
}

export const getShopSettings = async (): Promise<ShopSettings> => {
  return await invoke("get_shop_settings");
};
