// Database types for Supabase tables

export interface MappingConfig {
  amount_col: string;
  freq_col: string;
  reason_col?: string;
  location_col?: string; // Veld voor locatie/stad data
  freq_map: Record<string, number>;
  sale_results: string[];
}

export interface DBProject {
  id: string;
  name: string;
  project_key: string;
  basicall_project_id: number;
  basicall_token: string;
  is_active: boolean;
  hourly_rate: number;
  vat_rate: number;
  mapping_config: MappingConfig;
  created_at: string;
  updated_at: string;
}

export interface DBCallRecord {
  id: string;
  basicall_record_id: number;
  project_id: string;
  beldatum: string | null;
  beltijd: string | null;
  gesprekstijd_sec: number;
  resultaat: string | null;
  raw_data: Record<string, any> | null;
  week_number: number | null;
  synced_at: string;
}

export interface DBSyncLog {
  id: string;
  project_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  records_synced: number;
  error_message: string | null;
  sync_from: string | null;
  sync_to: string | null;
}

// Processed call record from database with calculated values
export interface ProcessedDBCallRecord extends DBCallRecord {
  annual_value: number;
  is_sale: boolean;
  is_recurring: boolean;
  day_name: string;
}
