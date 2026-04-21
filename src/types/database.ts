// Database types for Supabase tables

export type ProjectType = 'outbound' | 'inbound' | 'inbound_service';

// Optional report template per project. NULL = legacy behavior.
// Set by admin to switch UI + Excel export to historical rapportage layout.
export type ReportTemplate =
  | 'outbound_standard'
  | 'inbound_retention'
  | 'inbound_service'
  | 'flat';

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
  
  // Inbound klantenservice configuratie
  handled_results?: string[];        // Succesvol afgehandelde gesprekken
  not_handled_results?: string[];    // Niet-afgehandelde gesprekken (terugbellen, doorverbinden, etc.)
  
  // Configureerbare negatieve resultaat categorisering (outbound)
  unreachable_results?: string[];          // Resultaten die niet meetellen voor netto conversie
  negative_argumentated?: string[];        // Beargumenteerde weigeringen
  negative_not_argumentated?: string[];    // Niet-beargumenteerde weigeringen (externe factoren)

  // Per-result-code uitsluitingen van de noemer in ratio's (additief bovenop unreachable)
  exclude_from_net?: string[];             // Outbound: codes die niet meetellen in netto-conversie (bv. "overleden")
  exclude_from_retention?: string[];       // Inbound: codes die niet meetellen in retentie-ratio-noemer
  
  // Flat-template (ANBO / TTG) specifieke categorieën.
  // Records met deze resultaat-namen worden in een aparte rij "Max voicemail"
  // of "NAWT fout" getoond en tellen NIET mee in Totaal afgehandeld (denominator
  // voor percentages). Alleen relevant wanneer projects.report_template = 'flat'.
  flat_voicemail_results?: string[];
  flat_nawt_results?: string[];

  // Inbound-service-template targets (Sligro / NL Tour / Take 5 / Kemkens / Doorpro).
  // Alleen relevant wanneer projects.report_template = 'inbound_service'.
  // Bereikbaarheid = handled / (handled + notHandled); Service level = calls met
  // gesprekstijd < service_level_sec / totaal gesprekken. Targets standaard
  // 0.95 / 0.70 / 30s conform historische rapportages.
  service_targets?: {
    bereikbaarheid?: number;      // Doel-ratio, 0-1 (bijv. 0.95 = 95%)
    service_level?: number;       // Doel-ratio, 0-1 (bijv. 0.70 = 70%)
    service_level_sec?: number;   // Drempel in seconden (standaard 30)
  };

  // Inbound-retention-template reden-breakdown (Hersenstichting).
  // Map van reden-categorie (bv. "Overleden", "Financiele redenen") naar
  // een lijst van BasiCall result-codes die in die categorie vallen.
  // Alleen relevant wanneer projects.report_template = 'inbound_retention'.
  reason_categories?: Record<string, string[]>;

  // Afwijkend uurtarief per weekdag
  weekday_rates?: {
    maandag?: number;
    dinsdag?: number;
    woensdag?: number;
    donderdag?: number;
    vrijdag?: number;
    zaterdag?: number;
    zondag?: number;
  };
}

export interface DBProject {
  id: string;
  name: string;
  project_key: string;
  basicall_project_id: number;
  is_active: boolean;
  hourly_rate: number;
  vat_rate: number;
  project_type: ProjectType;
  mapping_config: MappingConfig;
  total_to_call: number | null;
  hours_factor: number;
  report_template: ReportTemplate | null;
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
  total_to_call: number | null;
  hours_factor: number;
  report_template: ReportTemplate | null;
  created_at: string;
  updated_at: string;
  // GEEN basicall_token - dit is het verschil met DBProject
}

// Union type voor functies die zowel DBProject als DBProjectPublic accepteren
// Gebruikt voor hooks/componenten die geen token nodig hebben
export type DBProjectBase = DBProject | DBProjectPublic;
