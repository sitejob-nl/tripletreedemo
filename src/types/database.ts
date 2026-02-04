// Database types for Supabase tables

export type ProjectType = 'outbound' | 'inbound';

export interface MappingConfig {
  amount_col: string;
  freq_col: string;
  reason_col?: string;
  location_col?: string; // Veld voor locatie/stad data
  freq_map: Record<string, number>;
  sale_results: string[];
  
  // Inbound-specifieke configuratie
  retention_results?: string[];      // Resultaten waarbij donateur behouden blijft
  lost_results?: string[];           // Resultaten waarbij donateur verloren is
  partial_success_results?: string[]; // Gedeeltelijk succes (bijv. eenmalig i.p.v. doorlopend)
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
  project_type: ProjectType;
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

// Sync job for the "remote control" sync system
export interface DBSyncJob {
  id: string;
  project_id: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  records_synced: number;
  log_message: string | null;
  created_by: string | null;
}

// Processed call record from database with calculated values
export interface ProcessedDBCallRecord extends DBCallRecord {
  annual_value: number;
  is_sale: boolean;
  is_recurring: boolean;
  day_name: string;
}

// Publieke project data (zonder gevoelige velden zoals basicall_token)
// Wordt gebruikt voor reguliere gebruikers die geen toegang tot tokens nodig hebben
export interface DBProjectPublic {
  id: string;
  name: string;
  project_key: string;
  basicall_project_id: number;
  is_active: boolean;
  hourly_rate: number;
  vat_rate: number;
  project_type: ProjectType;
  mapping_config: MappingConfig;
  created_at: string;
  updated_at: string;
  // GEEN basicall_token - dit is het verschil met DBProject
}

// Union type voor functies die zowel DBProject als DBProjectPublic accepteren
// Gebruikt voor hooks/componenten die geen token nodig hebben
export type DBProjectBase = DBProject | DBProjectPublic;
