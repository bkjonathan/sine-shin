export interface Customer {
  id: number;
  customer_id?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  social_media_url?: string | null;
  platform?: string | null;
  created_at?: string | null;
}

export interface CustomerFormData {
  name: string;
  phone: string;
  address: string;
  city: string;
  social_media_url: string;
  platform: string;
}

export type CustomerFormErrors = Partial<Record<keyof CustomerFormData, string>>;

export const createEmptyCustomerFormData = (): CustomerFormData => ({
  name: "",
  phone: "",
  address: "",
  city: "",
  social_media_url: "",
  platform: "",
});
