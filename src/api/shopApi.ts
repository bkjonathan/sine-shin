import { invoke } from "@tauri-apps/api/core";

import type { AwsS3ConnectionStatus } from "../types/settings";

export interface ShopSettingsRecord {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  logo_cloud_url: string | null;
  customer_id_prefix: string | null;
  order_id_prefix: string | null;
}

export interface UpdateShopSettingsPayload {
  shopName: string;
  phone: string;
  address: string;
  logoPath: string | null;
  customerIdPrefix: string;
  orderIdPrefix: string;
}

export const getShopSettings = async (): Promise<ShopSettingsRecord> => {
  return invoke<ShopSettingsRecord>("get_shop_settings");
};

export const updateShopSettings = async (
  payload: UpdateShopSettingsPayload,
): Promise<void> => {
  return invoke("update_shop_settings", {
    shopName: payload.shopName,
    phone: payload.phone,
    address: payload.address,
    logoPath: payload.logoPath,
    customerIdPrefix: payload.customerIdPrefix,
    orderIdPrefix: payload.orderIdPrefix,
  });
};

export const uploadShopLogoToS3 = async (
  logoPath: string,
): Promise<string> => {
  return invoke<string>("upload_shop_logo_to_s3", { logoPath });
};

export const getAwsS3ConnectionStatus = async (): Promise<AwsS3ConnectionStatus> => {
  return invoke<AwsS3ConnectionStatus>("get_aws_s3_connection_status");
};

export const testAwsS3Connection = async (
  config: {
    access_key_id: string;
    secret_access_key: string;
    region: string;
    bucket_name: string;
  },
): Promise<AwsS3ConnectionStatus> => {
  return invoke<AwsS3ConnectionStatus>("test_aws_s3_connection", { config });
};
