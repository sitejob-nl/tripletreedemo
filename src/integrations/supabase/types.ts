export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          basicall_batch_id: number
          created_at: string | null
          handled: number | null
          id: string
          last_synced_at: string | null
          name: string
          project_id: string
          remaining: number | null
          status: number | null
          total: number | null
        }
        Insert: {
          basicall_batch_id: number
          created_at?: string | null
          handled?: number | null
          id?: string
          last_synced_at?: string | null
          name: string
          project_id: string
          remaining?: number | null
          status?: number | null
          total?: number | null
        }
        Update: {
          basicall_batch_id?: number
          created_at?: string | null
          handled?: number | null
          id?: string
          last_synced_at?: string | null
          name?: string
          project_id?: string
          remaining?: number | null
          status?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      call_records: {
        Row: {
          basicall_record_id: number
          beldatum: string | null
          beldatum_date: string | null
          beltijd: string | null
          gesprekstijd_sec: number | null
          id: string
          project_id: string | null
          raw_data: Json | null
          resultaat: string | null
          synced_at: string | null
          week_number: number | null
        }
        Insert: {
          basicall_record_id: number
          beldatum?: string | null
          beldatum_date?: string | null
          beltijd?: string | null
          gesprekstijd_sec?: number | null
          id?: string
          project_id?: string | null
          raw_data?: Json | null
          resultaat?: string | null
          synced_at?: string | null
          week_number?: number | null
        }
        Update: {
          basicall_record_id?: number
          beldatum?: string | null
          beldatum_date?: string | null
          beltijd?: string | null
          gesprekstijd_sec?: number | null
          id?: string
          project_id?: string | null
          raw_data?: Json | null
          resultaat?: string | null
          synced_at?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logged_time: {
        Row: {
          corrected_at: string | null
          corrected_by: string | null
          corrected_seconds: number | null
          correction_note: string | null
          date: string
          id: string
          project_id: string
          synced_at: string | null
          total_seconds: number
        }
        Insert: {
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_seconds?: number | null
          correction_note?: string | null
          date: string
          id?: string
          project_id: string
          synced_at?: string | null
          total_seconds?: number
        }
        Update: {
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_seconds?: number | null
          correction_note?: string | null
          date?: string
          id?: string
          project_id?: string
          synced_at?: string | null
          total_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_logged_time_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logged_time_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          component_name: string | null
          created_at: string
          error_message: string
          error_type: string
          id: string
          is_resolved: boolean | null
          metadata: Json | null
          stack_trace: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_name?: string | null
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          stack_trace?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          stack_trace?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pending_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          project_ids: string[] | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          project_ids?: string[] | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          project_ids?: string[] | null
        }
        Relationships: []
      }
      project_secrets: {
        Row: {
          basicall_token: string
          created_at: string | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          basicall_token: string
          created_at?: string | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          basicall_token?: string
          created_at?: string | null
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_secrets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_secrets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          basicall_project_id: number
          created_at: string | null
          hourly_rate: number | null
          hours_factor: number | null
          id: string
          is_active: boolean | null
          mapping_config: Json | null
          name: string
          project_key: string
          project_type: string | null
          total_to_call: number | null
          updated_at: string | null
          vat_rate: number | null
        }
        Insert: {
          basicall_project_id: number
          created_at?: string | null
          hourly_rate?: number | null
          hours_factor?: number | null
          id?: string
          is_active?: boolean | null
          mapping_config?: Json | null
          name: string
          project_key: string
          project_type?: string | null
          total_to_call?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Update: {
          basicall_project_id?: number
          created_at?: string | null
          hourly_rate?: number | null
          hours_factor?: number | null
          id?: string
          is_active?: boolean | null
          mapping_config?: Json | null
          name?: string
          project_key?: string
          project_type?: string | null
          total_to_call?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          log_message: string | null
          project_id: string
          records_synced: number | null
          start_date: string
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          log_message?: string | null
          project_id: string
          records_synced?: number | null
          start_date: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          log_message?: string | null
          project_id?: string
          records_synced?: number | null
          start_date?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          project_id: string | null
          records_synced: number | null
          started_at: string | null
          status: string | null
          sync_from: string | null
          sync_to: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          project_id?: string | null
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_from?: string | null
          sync_to?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          project_id?: string | null
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_from?: string | null
          sync_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      mapping_issues: {
        Row: {
          basicall_project_id: number | null
          issue_message: string | null
          issue_type: string | null
          name: string | null
          project_id: string | null
          project_type: string | null
        }
        Relationships: []
      }
      projects_public: {
        Row: {
          created_at: string | null
          hours_factor: number | null
          id: string | null
          is_active: boolean | null
          mapping_config: Json | null
          name: string | null
          project_key: string | null
          project_type: string | null
          total_to_call: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hours_factor?: number | null
          id?: string | null
          is_active?: boolean | null
          mapping_config?: Json | null
          name?: string | null
          project_key?: string | null
          project_type?: string | null
          total_to_call?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hours_factor?: number | null
          id?: string | null
          is_active?: boolean | null
          mapping_config?: Json | null
          name?: string | null
          project_key?: string | null
          project_type?: string | null
          total_to_call?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_available_weeks: {
        Args: { p_project_id: string }
        Returns: {
          iso_year: number
          value: string
          week_number: number
        }[]
      }
      get_project_annual_value: {
        Args: {
          p_end_date?: string
          p_project_id: string
          p_start_date?: string
          p_week_number?: number
          p_year?: number
        }
        Returns: number
      }
      get_project_kpi_totals: {
        Args: {
          p_project_id: string
          p_sale_results?: string[]
          p_week_number?: number
        }
        Returns: {
          total_gesprekstijd_sec: number
          total_records: number
          total_sales: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "superadmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "superadmin"],
    },
  },
} as const
