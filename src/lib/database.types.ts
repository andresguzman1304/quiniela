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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      item_scores: {
        Row: {
          breakdown: Json | null
          computed_at: string
          points: number
          pool_item_id: string
          ticket_id: string
          tier: string
        }
        Insert: {
          breakdown?: Json | null
          computed_at?: string
          points?: number
          pool_item_id: string
          ticket_id: string
          tier: string
        }
        Update: {
          breakdown?: Json | null
          computed_at?: string
          points?: number
          pool_item_id?: string
          ticket_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_scores_pool_item_id_fkey"
            columns: ["pool_item_id"]
            isOneToOne: false
            referencedRelation: "pool_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_scores_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_items: {
        Row: {
          id: string
          item_index: number
          lock_at: string
          payload: Json
          pool_id: string
          result: Json | null
          result_entered_at: string | null
        }
        Insert: {
          id?: string
          item_index: number
          lock_at: string
          payload: Json
          pool_id: string
          result?: Json | null
          result_entered_at?: string | null
        }
        Update: {
          id?: string
          item_index?: number
          lock_at?: string
          payload?: Json
          pool_id?: string
          result?: Json | null
          result_entered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pool_items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          config: Json
          created_at: string
          currency: string
          id: string
          join_code: string
          max_tickets_per_user: number
          organizer_id: string
          price_cents: number
          scoring_locked: boolean
          title: string
          type: Database["public"]["Enums"]["pool_type"]
        }
        Insert: {
          config?: Json
          created_at?: string
          currency?: string
          id?: string
          join_code: string
          max_tickets_per_user?: number
          organizer_id: string
          price_cents?: number
          scoring_locked?: boolean
          title: string
          type: Database["public"]["Enums"]["pool_type"]
        }
        Update: {
          config?: Json
          created_at?: string
          currency?: string
          id?: string
          join_code?: string
          max_tickets_per_user?: number
          organizer_id?: string
          price_cents?: number
          scoring_locked?: boolean
          title?: string
          type?: Database["public"]["Enums"]["pool_type"]
        }
        Relationships: []
      }
      predictions: {
        Row: {
          id: string
          payload: Json
          pool_item_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          payload: Json
          pool_item_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          pool_item_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_pool_item_id_fkey"
            columns: ["pool_item_id"]
            isOneToOne: false
            referencedRelation: "pool_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          id: string
          paid: boolean
          paid_at: string | null
          pool_id: string
          ticket_number: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          pool_id: string
          ticket_number: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          pool_id?: string
          ticket_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buy_ticket: { Args: { p_pool: string }; Returns: string }
      create_pool: {
        Args: {
          p_config?: Json
          p_currency?: string
          p_items?: Json
          p_max_tickets?: number
          p_price_cents?: number
          p_title: string
          p_type: Database["public"]["Enums"]["pool_type"]
        }
        Returns: Json
      }
      get_leaderboard: {
        Args: { p_pool: string }
        Returns: {
          display_name: string
          exact_hits: number
          paid: boolean
          predictions_made: number
          rank: number
          result_hits: number
          ticket_id: string
          ticket_number: number
          total_points: number
          user_id: string
        }[]
      }
      get_pool_preview: { Args: { p_code: string }; Returns: Json }
      get_pool_stats: {
        Args: { p_pool: string }
        Returns: {
          incomplete_tickets: number
          item_count: number
          paid_tickets: number
          pot_cents: number
          results_in: number
          total_tickets: number
          unpaid_tickets: number
        }[]
      }
      join_pool: { Args: { p_code: string }; Returns: string }
      recompute_item: { Args: { p_item_id: string }; Returns: undefined }
      recompute_pool: { Args: { p_pool_id: string }; Returns: undefined }
      score_football_exact: {
        Args: { p_cfg: Json; p_pred: Json; p_res: Json }
        Returns: Json
      }
      score_prediction: {
        Args: {
          p_cfg: Json
          p_pred: Json
          p_res: Json
          p_type: Database["public"]["Enums"]["pool_type"]
        }
        Returns: Json
      }
      set_item_result: {
        Args: { p_item: string; p_result: Json }
        Returns: undefined
      }
      set_ticket_paid: {
        Args: { p_paid: boolean; p_ticket: string }
        Returns: undefined
      }
    }
    Enums: {
      pool_type: "football_exact_score"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      pool_type: ["football_exact_score"],
    },
  },
} as const
