export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  social_media_url?: string | null;
  platform?: string | null;
  created_at?: string | null;
}
