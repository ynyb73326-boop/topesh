/**
 * Generated-style Database types for Phase 5A schema.
 * Regenerate with `npx supabase gen types typescript --local` when the local
 * Supabase stack is running, then replace this file if drift appears.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = "manager" | "team_leader"
export type DiaryStatus = "pending" | "submitted" | "cancelled"

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          company_id: string | null
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          id: string
          customer_id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          person_id: string
          auth_user_id: string | null
          full_name: string
          identity_number: string | null
          phone: string | null
          email: string | null
          company_id: string | null
          role: AppRole
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          person_id?: string
          auth_user_id?: string | null
          full_name: string
          identity_number?: string | null
          phone?: string | null
          email?: string | null
          company_id?: string | null
          role: AppRole
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          person_id?: string
          auth_user_id?: string | null
          full_name?: string
          identity_number?: string | null
          phone?: string | null
          email?: string | null
          company_id?: string | null
          role?: AppRole
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          id: string
          full_name: string
          phone: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          full_name: string
          phone: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      systems: {
        Row: {
          id: string
          name: string
          is_active: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      components: {
        Row: {
          id: string
          system_id: string
          name: string
          unit: string
          is_active: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          system_id: string
          name: string
          unit: string
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          system_id?: string
          name?: string
          unit?: string
          is_active?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "components_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
        ]
      }
      checkbox_definitions: {
        Row: {
          id: string
          label: string
          sort_order: number
          is_active: boolean
        }
        Insert: {
          id?: string
          label: string
          sort_order: number
          is_active?: boolean
        }
        Update: {
          id?: string
          label?: string
          sort_order?: number
          is_active?: boolean
        }
        Relationships: []
      }
      work_diaries: {
        Row: {
          id: string
          team_leader_id: string
          work_date: string
          company_id: string
          customer_id: string
          site_id: string
          sub_site_name: string
          project_name: string
          work_order_number: string
          accompanying_technician_id: string | null
          status: DiaryStatus
          notes: string
          site_manager_name: string | null
          site_manager_signature_data_url: string | null
          created_at: string
          submitted_at: string | null
          cancelled_at: string | null
          duplicated_from_id: string | null
          signature_capture_only: boolean
        }
        Insert: {
          id?: string
          team_leader_id: string
          work_date: string
          company_id: string
          customer_id: string
          site_id: string
          sub_site_name?: string
          project_name?: string
          work_order_number: string
          accompanying_technician_id?: string | null
          status?: DiaryStatus
          notes?: string
          site_manager_name?: string | null
          site_manager_signature_data_url?: string | null
          created_at?: string
          submitted_at?: string | null
          cancelled_at?: string | null
          duplicated_from_id?: string | null
          signature_capture_only?: boolean
        }
        Update: {
          id?: string
          team_leader_id?: string
          work_date?: string
          company_id?: string
          customer_id?: string
          site_id?: string
          sub_site_name?: string
          project_name?: string
          work_order_number?: string
          accompanying_technician_id?: string | null
          status?: DiaryStatus
          notes?: string
          site_manager_name?: string | null
          site_manager_signature_data_url?: string | null
          created_at?: string
          submitted_at?: string | null
          cancelled_at?: string | null
          duplicated_from_id?: string | null
          signature_capture_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "work_diaries_team_leader_id_fkey"
            columns: ["team_leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diaries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diaries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diaries_accompanying_technician_id_fkey"
            columns: ["accompanying_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      work_diary_workers: {
        Row: {
          id: string
          diary_id: string
          full_name: string
          sort_order: number
        }
        Insert: {
          id?: string
          diary_id: string
          full_name: string
          sort_order?: number
        }
        Update: {
          id?: string
          diary_id?: string
          full_name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_diary_workers_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "work_diaries"
            referencedColumns: ["id"]
          },
        ]
      }
      work_diary_items: {
        Row: {
          id: string
          diary_id: string
          component_id: string
          quantity: number
        }
        Insert: {
          id?: string
          diary_id: string
          component_id: string
          quantity: number
        }
        Update: {
          id?: string
          diary_id?: string
          component_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_diary_items_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "work_diaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diary_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      work_diary_checkbox_selections: {
        Row: {
          id: string
          diary_id: string
          checkbox_id: string
          checked: boolean
        }
        Insert: {
          id?: string
          diary_id: string
          checkbox_id: string
          checked?: boolean
        }
        Update: {
          id?: string
          diary_id?: string
          checkbox_id?: string
          checked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "work_diary_checkbox_selections_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "work_diaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_diary_checkbox_selections_checkbox_id_fkey"
            columns: ["checkbox_id"]
            isOneToOne: false
            referencedRelation: "checkbox_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      work_diaries_for_leader: {
        Row: {
          id: string
          team_leader_id: string
          work_date: string
          site_id: string
          sub_site_name: string
          project_name: string
          accompanying_technician_id: string | null
          status: DiaryStatus
          notes: string
          site_manager_name: string | null
          site_manager_signature_data_url: string | null
          created_at: string
          submitted_at: string | null
          cancelled_at: string | null
          duplicated_from_id: string | null
          signature_capture_only: boolean
        }
        Relationships: []
      }
    }
    Functions: {
      submit_work_diary: {
        Args: { p_diary_id: string }
        Returns: Database["public"]["Tables"]["work_diaries"]["Row"]
      }
      update_work_diary_signature: {
        Args: {
          p_diary_id: string
          p_site_manager_name: string
          p_site_manager_signature_data_url: string
        }
        Returns: Database["public"]["Tables"]["work_diaries"]["Row"]
      }
      cancel_work_diary: {
        Args: { p_diary_id: string }
        Returns: Database["public"]["Tables"]["work_diaries"]["Row"]
      }
      app_current_profile_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
    }
    Enums: {
      app_role: AppRole
      diary_status: DiaryStatus
    }
    CompositeTypes: Record<string, never>
  }
}
