import { invoke } from "@tauri-apps/api/core";
import { Customer, CustomerMutationInput } from "../types/customer";

export const CUSTOMER_PAGE_SIZE_LIMITS = {
  min: 5,
  max: 100,
  default: 10,
} as const;

const normalizePageSize = (pageSize?: number | "all"): number => {
  if (pageSize === "all") {
    return -1;
  }

  const requested = pageSize ?? CUSTOMER_PAGE_SIZE_LIMITS.default;
  return Math.min(
    CUSTOMER_PAGE_SIZE_LIMITS.max,
    Math.max(CUSTOMER_PAGE_SIZE_LIMITS.min, requested),
  );
};

const clampPage = (page?: number): number => {
  return Math.max(1, page ?? 1);
};

export const getCustomers = async (): Promise<Customer[]> => {
  return await invoke("get_customers");
};

export interface CustomerSearchParams {
  page?: number;
  pageSize?: number | "all";
  searchKey?: "name" | "customerId" | "phone";
  searchTerm?: string;
  sortBy?: "name" | "customer_id" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedCustomers {
  customers: Customer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const getCustomersPaginated = async (
  params: CustomerSearchParams,
): Promise<PaginatedCustomers> => {
  return await invoke("get_customers_paginated", {
    page: clampPage(params.page),
    pageSize: normalizePageSize(params.pageSize),
    searchKey: params.searchKey,
    searchTerm: params.searchTerm,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
};

export const createCustomer = async (
  customer: CustomerMutationInput,
): Promise<string> => {
  return await invoke("create_customer", {
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    socialMediaUrl: customer.social_media_url,
    platform: customer.platform,
    id: customer.id,
    customerId: customer.customer_id,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
    deletedAt: customer.deleted_at,
  });
};

export const updateCustomer = async (
  customer: CustomerMutationInput & { id: string },
): Promise<void> => {
  return await invoke("update_customer", {
    id: customer.id,
    customerId: customer.customer_id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    socialMediaUrl: customer.social_media_url,
    platform: customer.platform,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
    deletedAt: customer.deleted_at,
  });
};

export const deleteCustomer = async (id: string): Promise<void> => {
  return await invoke("delete_customer", { id });
};

export const getCustomerById = async (id: string): Promise<Customer> => {
  return await invoke("get_customer", { id });
};

import { Order } from "../types/order";

export const getCustomerOrders = async (
  customerId: string,
): Promise<Order[]> => {
  return await invoke("get_customer_orders", { customerId });
};
