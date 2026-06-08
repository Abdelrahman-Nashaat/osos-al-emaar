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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company: string | null
          country: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          actor_id: string | null
          amount: number | null
          created_at: string
          event_type: Database["public"]["Enums"]["invoice_event_type"]
          from_status: Database["public"]["Enums"]["invoice_status"] | null
          id: number
          invoice_id: string
          metadata: Json
          note: string | null
          to_status: Database["public"]["Enums"]["invoice_status"] | null
        }
        Insert: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          event_type: Database["public"]["Enums"]["invoice_event_type"]
          from_status?: Database["public"]["Enums"]["invoice_status"] | null
          id?: never
          invoice_id: string
          metadata?: Json
          note?: string | null
          to_status?: Database["public"]["Enums"]["invoice_status"] | null
        }
        Update: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["invoice_event_type"]
          from_status?: Database["public"]["Enums"]["invoice_status"] | null
          id?: never
          invoice_id?: string
          metadata?: Json
          note?: string | null
          to_status?: Database["public"]["Enums"]["invoice_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          project_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          amount_paid?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          amount_paid?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          is_reversed: boolean
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          recorded_by: string | null
          reference: string | null
          reversal_note: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          is_reversed?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          reversal_note?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          is_reversed?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          reversal_note?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_financials: {
        Row: {
          budget: number | null
          contract_value: number | null
          cost: number | null
          created_at: string
          currency: string
          notes: string | null
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget?: number | null
          contract_value?: number | null
          cost?: number | null
          created_at?: string
          currency?: string
          notes?: string | null
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget?: number | null
          contract_value?: number | null
          cost?: number | null
          created_at?: string
          currency?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_financials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_financials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          allowed?: boolean
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          allowed?: boolean
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      task_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["task_event_type"]
          from_assignee: string | null
          from_status: Database["public"]["Enums"]["task_status"] | null
          id: number
          metadata: Json
          note: string | null
          task_id: string
          to_assignee: string | null
          to_status: Database["public"]["Enums"]["task_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["task_event_type"]
          from_assignee?: string | null
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: never
          metadata?: Json
          note?: string | null
          task_id: string
          to_assignee?: string | null
          to_status?: Database["public"]["Enums"]["task_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["task_event_type"]
          from_assignee?: string | null
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: never
          metadata?: Json
          note?: string | null
          task_id?: string
          to_assignee?: string | null
          to_status?: Database["public"]["Enums"]["task_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_from_assignee_fkey"
            columns: ["from_assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_to_assignee_fkey"
            columns: ["to_assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string | null
          current_assignee_id: string | null
          description: string | null
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_assignee_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_assignee_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_current_assignee_id_fkey"
            columns: ["current_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          allowed: boolean
          permission_key: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          permission_key: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_financials: { Args: never; Returns: boolean }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_perm: { Args: { perm_key: string }; Returns: boolean }
      invoice_add_note: {
        Args: { p_invoice: string; p_note: string }
        Returns: undefined
      }
      invoice_create: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_issue_date?: string
          p_note?: string
          p_project: string
          p_subtotal: number
          p_vat_rate?: number
        }
        Returns: string
      }
      invoice_delete: {
        Args: { p_invoice: string; p_note?: string }
        Returns: undefined
      }
      invoice_record_payment: {
        Args: {
          p_amount: number
          p_invoice: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_paid_at?: string
          p_reference?: string
        }
        Returns: string
      }
      invoice_send: {
        Args: { p_invoice: string; p_note?: string }
        Returns: undefined
      }
      invoice_update: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_invoice: string
          p_subtotal: number
          p_vat_rate?: number
        }
        Returns: undefined
      }
      invoice_void: {
        Args: { p_invoice: string; p_note?: string }
        Returns: undefined
      }
      is_accountant: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      payment_reverse: {
        Args: { p_note?: string; p_payment: string }
        Returns: undefined
      }
      task_add_note: {
        Args: { p_note: string; p_task: string }
        Returns: undefined
      }
      task_assign: {
        Args: { p_assignee: string; p_note?: string; p_task: string }
        Returns: undefined
      }
      task_close: {
        Args: { p_note?: string; p_task: string }
        Returns: undefined
      }
      task_create: {
        Args: {
          p_assignee?: string
          p_description?: string
          p_due_at?: string
          p_note?: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_project: string
          p_title: string
        }
        Returns: string
      }
      task_delete: {
        Args: { p_note?: string; p_task: string }
        Returns: undefined
      }
      task_milestone: {
        Args: { p_label: string; p_note?: string; p_task: string }
        Returns: undefined
      }
      task_reopen: {
        Args: { p_note?: string; p_task: string }
        Returns: undefined
      }
      task_set_progress: {
        Args: { p_note?: string; p_progress: number; p_task: string }
        Returns: undefined
      }
      task_start: { Args: { p_task: string }; Returns: undefined }
      task_submit: {
        Args: { p_note?: string; p_task: string }
        Returns: undefined
      }
      team_directory: {
        Args: never
        Returns: {
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
    }
    Enums: {
      app_role: "manager" | "engineer" | "accountant"
      invoice_event_type:
        | "created"
        | "sent"
        | "payment"
        | "payment_reversed"
        | "voided"
        | "note"
      invoice_status: "draft" | "sent" | "partially_paid" | "paid" | "void"
      payment_method: "cash" | "bank_transfer" | "cheque" | "card" | "other"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      task_event_type:
        | "created"
        | "assigned"
        | "reassigned"
        | "started"
        | "progress"
        | "note"
        | "submitted"
        | "reopened"
        | "closed"
        | "milestone"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "new" | "assigned" | "in_progress" | "submitted" | "closed"
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
      app_role: ["manager", "engineer", "accountant"],
      invoice_event_type: [
        "created",
        "sent",
        "payment",
        "payment_reversed",
        "voided",
        "note",
      ],
      invoice_status: ["draft", "sent", "partially_paid", "paid", "void"],
      payment_method: ["cash", "bank_transfer", "cheque", "card", "other"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      task_event_type: [
        "created",
        "assigned",
        "reassigned",
        "started",
        "progress",
        "note",
        "submitted",
        "reopened",
        "closed",
        "milestone",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["new", "assigned", "in_progress", "submitted", "closed"],
    },
  },
} as const
