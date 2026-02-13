import { invoke } from "@tauri-apps/api/core";
import { Customer } from "../types/customer";

export const getCustomers = async (): Promise<Customer[]> => {
  return await invoke("get_customers");
};

export const createCustomer = async (
  customer: Omit<Customer, "id" | "created_at">,
): Promise<number> => {
  return await invoke("create_customer", {
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    socialMediaUrl: customer.social_media_url,
    platform: customer.platform,
  });
};

export const updateCustomer = async (customer: Customer): Promise<void> => {
  return await invoke("update_customer", {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    socialMediaUrl: customer.social_media_url,
    platform: customer.platform,
  });
};

export const deleteCustomer = async (id: number): Promise<void> => {
  return await invoke("delete_customer", { id });
};
