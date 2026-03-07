export type ThemeMode = "light" | "dark";
export type AccentColor = "blue" | "purple" | "pink" | "cyan" | "green";
export type FontSize = "small" | "normal" | "large" | "extra-large";

export interface AppSettings {
  language: string;
  sound_effect: boolean;
  theme: ThemeMode;
  accent_color: AccentColor;
  currency: string;
  currency_symbol: string;
  exchange_currency: string;
  exchange_currency_symbol: string;
  invoice_printer_name: string;
  silent_invoice_print: boolean;
  auto_backup: boolean;
  backup_frequency: string;
  backup_time: string;
  font_size: FontSize;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_region: string;
  aws_bucket_name: string;
  imagekit_base_url: string;
}

export interface AppSettingsLanguage {
  language: string;
}

export interface AwsS3ConnectionStatus {
  connected: boolean;
  message: string;
}

export interface AwsS3Config {
  access_key_id: string;
  secret_access_key: string;
  region: string;
  bucket_name: string;
}

export interface DriveConnectionStatus {
  connected: boolean;
  email: string | null;
}

export interface DbStatus {
  total_tables: number;
  tables: Array<{ name: string; row_count: number }>;
  size_bytes: number | null;
}

export interface ResetTableSequenceResult {
  table_name: string;
  max_id: number;
  sequence_value: number;
}
