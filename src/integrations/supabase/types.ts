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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      battle_cases: {
        Row: {
          battle_id: string
          case_id: string
          id: string
          position: number
        }
        Insert: {
          battle_id: string
          case_id: string
          id?: string
          position: number
        }
        Update: {
          battle_id?: string
          case_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_cases_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_players: {
        Row: {
          avatar_url: string | null
          battle_id: string
          created_at: string
          id: string
          is_bot: boolean
          slot: number
          team: number
          total_value: number
          user_id: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          battle_id: string
          created_at?: string
          id?: string
          is_bot?: boolean
          slot: number
          team?: number
          total_value?: number
          user_id?: string | null
          username?: string
        }
        Update: {
          avatar_url?: string | null
          battle_id?: string
          created_at?: string
          id?: string
          is_bot?: boolean
          slot?: number
          team?: number
          total_value?: number
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_players_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rounds: {
        Row: {
          battle_id: string
          case_id: string | null
          created_at: string
          id: string
          item_id: string | null
          roll: number
          round: number
          slot: number
          value: number
        }
        Insert: {
          battle_id: string
          case_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          roll?: number
          round: number
          slot: number
          value?: number
        }
        Update: {
          battle_id?: string
          case_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          roll?: number
          round?: number
          slot?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_rounds_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_rounds_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_rounds_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_seeds: {
        Row: {
          battle_id: string
          client_seed: string
          created_at: string
          server_seed: string
        }
        Insert: {
          battle_id: string
          client_seed: string
          created_at?: string
          server_seed: string
        }
        Update: {
          battle_id?: string
          client_seed?: string
          created_at?: string
          server_seed?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_seeds_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: true
            referencedRelation: "battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battles: {
        Row: {
          client_seed: string | null
          cost: number
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          mode: Database["public"]["Enums"]["battle_mode"]
          player_count: number
          pot: number
          rounds: number
          server_seed_hash: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["battle_status"]
          winner_slots: number[]
        }
        Insert: {
          client_seed?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["battle_mode"]
          player_count?: number
          pot?: number
          rounds?: number
          server_seed_hash?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["battle_status"]
          winner_slots?: number[]
        }
        Update: {
          client_seed?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["battle_mode"]
          player_count?: number
          pot?: number
          rounds?: number
          server_seed_hash?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["battle_status"]
          winner_slots?: number[]
        }
        Relationships: []
      }
      case_items: {
        Row: {
          case_id: string
          id: string
          item_id: string
          weight: number
        }
        Insert: {
          case_id: string
          id?: string
          item_id: string
          weight?: number
        }
        Update: {
          case_id?: string
          id?: string
          item_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      case_openings: {
        Row: {
          avatar_url: string | null
          case_id: string | null
          client_seed: string | null
          cost: number
          created_at: string
          id: string
          item_id: string | null
          nonce: number | null
          roll: number
          server_seed_hash: string | null
          user_id: string | null
          username: string
          value: number
        }
        Insert: {
          avatar_url?: string | null
          case_id?: string | null
          client_seed?: string | null
          cost?: number
          created_at?: string
          id?: string
          item_id?: string | null
          nonce?: number | null
          roll?: number
          server_seed_hash?: string | null
          user_id?: string | null
          username?: string
          value?: number
        }
        Update: {
          avatar_url?: string | null
          case_id?: string | null
          client_seed?: string | null
          cost?: number
          created_at?: string
          id?: string
          item_id?: string | null
          nonce?: number | null
          roll?: number
          server_seed_hash?: string | null
          user_id?: string | null
          username?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_openings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_openings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          category: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          slug: string
          tag: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          slug: string
          tag?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          slug?: string
          tag?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          avatar_url: string | null
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          user_id: string
          username?: string
        }
        Update: {
          avatar_url?: string | null
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          client_seed: string | null
          created_at: string
          id: string
          input_count: number
          input_value: number
          nonce: number | null
          output_item_id: string | null
          output_value: number
          roll: number
          server_seed_hash: string | null
          user_id: string
        }
        Insert: {
          client_seed?: string | null
          created_at?: string
          id?: string
          input_count?: number
          input_value?: number
          nonce?: number | null
          output_item_id?: string | null
          output_value?: number
          roll?: number
          server_seed_hash?: string | null
          user_id: string
        }
        Update: {
          client_seed?: string | null
          created_at?: string
          id?: string
          input_count?: number
          input_value?: number
          nonce?: number | null
          output_item_id?: string | null
          output_value?: number
          roll?: number
          server_seed_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          source: string
          source_ref: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          source?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          source?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          base_price: number
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_override: number | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          slug: string
          weapon: string | null
        }
        Insert: {
          base_price?: number
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_override?: number | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          slug: string
          weapon?: string | null
        }
        Update: {
          base_price?: number
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_override?: number | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          slug?: string
          weapon?: string | null
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account: string
          amount: number
          created_at: string
          direction: string
          id: string
          memo: string | null
          ref_id: string | null
          ref_type: string | null
          tx_id: string
          user_id: string | null
        }
        Insert: {
          account: string
          amount: number
          created_at?: string
          direction: string
          id?: string
          memo?: string | null
          ref_id?: string | null
          ref_type?: string | null
          tx_id: string
          user_id?: string | null
        }
        Update: {
          account?: string
          amount?: number
          created_at?: string
          direction?: string
          id?: string
          memo?: string | null
          ref_id?: string | null
          ref_type?: string | null
          tx_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          frozen_balance: number
          id: string
          is_banned: boolean
          is_muted: boolean
          level: number
          rtp_override: number | null
          steam_id: string | null
          trade_url: string | null
          updated_at: string
          username: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          frozen_balance?: number
          id: string
          is_banned?: boolean
          is_muted?: boolean
          level?: number
          rtp_override?: number | null
          steam_id?: string | null
          trade_url?: string | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          frozen_balance?: number
          id?: string
          is_banned?: boolean
          is_muted?: boolean
          level?: number
          rtp_override?: number | null
          steam_id?: string | null
          trade_url?: string | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      upgrades: {
        Row: {
          chance: number
          client_seed: string | null
          created_at: string
          id: string
          mode: string
          nonce: number | null
          roll: number
          server_seed_hash: string | null
          stake: number
          target_item_id: string | null
          target_value: number
          user_id: string
          won: boolean
        }
        Insert: {
          chance?: number
          client_seed?: string | null
          created_at?: string
          id?: string
          mode?: string
          nonce?: number | null
          roll?: number
          server_seed_hash?: string | null
          stake?: number
          target_item_id?: string | null
          target_value?: number
          user_id: string
          won?: boolean
        }
        Update: {
          chance?: number
          client_seed?: string | null
          created_at?: string
          id?: string
          mode?: string
          nonce?: number | null
          roll?: number
          server_seed_hash?: string | null
          stake?: number
          target_item_id?: string | null
          target_value?: number
          user_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "upgrades_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_seeds: {
        Row: {
          client_seed: string
          created_at: string
          id: string
          is_active: boolean
          nonce: number
          revealed_at: string | null
          server_seed: string
          server_seed_hash: string
          user_id: string
        }
        Insert: {
          client_seed: string
          created_at?: string
          id?: string
          is_active?: boolean
          nonce?: number
          revealed_at?: string | null
          server_seed: string
          server_seed_hash: string
          user_id: string
        }
        Update: {
          client_seed?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nonce?: number
          revealed_at?: string | null
          server_seed?: string
          server_seed_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          item_id: string | null
          note: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          steam_id: string | null
          trade_offer_id: string | null
          trade_url: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          item_id?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          steam_id?: string | null
          trade_offer_id?: string | null
          trade_url: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          item_id?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          steam_id?: string | null
          trade_offer_id?: string | null
          trade_url?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_battle_create: {
        Args: {
          p_cases: string[]
          p_client_seed: string
          p_hash: string
          p_mode: Database["public"]["Enums"]["battle_mode"]
          p_players: number
          p_user: string
        }
        Returns: string
      }
      fn_battle_join: {
        Args: {
          p_battle: string
          p_bot: boolean
          p_slot: number
          p_user: string
        }
        Returns: Json
      }
      fn_battle_settle: {
        Args: { p_battle: string; p_rounds: Json; p_winner_slots: number[] }
        Returns: Json
      }
      fn_contract: {
        Args: {
          p_client_seed: string
          p_hash: string
          p_inventory: string[]
          p_item: string
          p_nonce: number
          p_roll: number
          p_user: string
        }
        Returns: Json
      }
      fn_open_case: {
        Args: {
          p_case: string
          p_client_seed: string
          p_hash: string
          p_item: string
          p_nonce: number
          p_roll: number
          p_user: string
        }
        Returns: Json
      }
      fn_request_withdrawal: {
        Args: { p_inventory: string; p_user: string }
        Returns: Json
      }
      fn_resolve_withdrawal: {
        Args: {
          p_note: string
          p_offer: string
          p_status: Database["public"]["Enums"]["withdrawal_status"]
          p_withdrawal: string
        }
        Returns: Json
      }
      fn_sell_item: {
        Args: { p_inventory: string; p_user: string }
        Returns: Json
      }
      fn_upgrade: {
        Args: {
          p_chance: number
          p_client_seed: string
          p_hash: string
          p_inventory: string[]
          p_nonce: number
          p_roll: number
          p_stake: number
          p_target: string
          p_user: string
          p_won: boolean
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "moderator" | "finance" | "support"
      battle_mode: "ffa" | "team2v2" | "crazy"
      battle_status: "waiting" | "running" | "finished" | "cancelled"
      inventory_status: "owned" | "sold" | "withdrawn" | "used"
      item_rarity:
        | "consumer"
        | "industrial"
        | "milspec"
        | "restricted"
        | "classified"
        | "covert"
        | "exotic"
        | "contraband"
      withdrawal_status: "pending" | "sent" | "failed" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "admin", "moderator", "finance", "support"],
      battle_mode: ["ffa", "team2v2", "crazy"],
      battle_status: ["waiting", "running", "finished", "cancelled"],
      inventory_status: ["owned", "sold", "withdrawn", "used"],
      item_rarity: [
        "consumer",
        "industrial",
        "milspec",
        "restricted",
        "classified",
        "covert",
        "exotic",
        "contraband",
      ],
      withdrawal_status: ["pending", "sent", "failed", "cancelled"],
    },
  },
} as const
