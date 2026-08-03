export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      buildings: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
          street: string
          total_area_m2: number | null
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
          street: string
          total_area_m2?: number | null
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
          street?: string
          total_area_m2?: number | null
        }
        Relationships: []
      }
      owners: {
        Row: {
          building_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      resolutions: {
        Row: {
          body: string
          building_id: string
          created_at: string
          id: string
          number: string
          opened_at: string | null
          status: string
          title: string
        }
        Insert: {
          body: string
          building_id: string
          created_at?: string
          id?: string
          number: string
          opened_at?: string | null
          status?: string
          title: string
        }
        Update: {
          body?: string
          building_id?: string
          created_at?: string
          id?: string
          number?: string
          opened_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolutions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          area_m2: number
          building_id: string
          created_at: string
          id: string
          owner_id: string
          share_bps: number
          unit_number: string
        }
        Insert: {
          area_m2: number
          building_id: string
          created_at?: string
          id?: string
          owner_id: string
          share_bps: number
          unit_number: string
        }
        Update: {
          area_m2?: number
          building_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          share_bps?: number
          unit_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_owner_same_building_fkey"
            columns: ["owner_id", "building_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id", "building_id"]
          },
        ]
      }
      votes: {
        Row: {
          building_id: string
          choice: string
          created_at: string
          id: string
          owner_id: string
          resolution_id: string
          share_bps: number
          voting_link_id: string
        }
        Insert: {
          building_id: string
          choice: string
          created_at?: string
          id?: string
          owner_id: string
          resolution_id: string
          share_bps: number
          voting_link_id: string
        }
        Update: {
          building_id?: string
          choice?: string
          created_at?: string
          id?: string
          owner_id?: string
          resolution_id?: string
          share_bps?: number
          voting_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_owner_same_building_fkey"
            columns: ["owner_id", "building_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id", "building_id"]
          },
          {
            foreignKeyName: "votes_resolution_same_building_fkey"
            columns: ["resolution_id", "building_id"]
            isOneToOne: false
            referencedRelation: "resolutions"
            referencedColumns: ["id", "building_id"]
          },
          {
            foreignKeyName: "votes_voting_link_id_fkey"
            columns: ["voting_link_id"]
            isOneToOne: false
            referencedRelation: "voting_links"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_links: {
        Row: {
          building_id: string
          created_at: string
          id: string
          owner_id: string
          resolution_id: string
          token: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          owner_id: string
          resolution_id: string
          token: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          resolution_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "voting_links_owner_same_building_fkey"
            columns: ["owner_id", "building_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id", "building_id"]
          },
          {
            foreignKeyName: "voting_links_resolution_same_building_fkey"
            columns: ["resolution_id", "building_id"]
            isOneToOne: false
            referencedRelation: "resolutions"
            referencedColumns: ["id", "building_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_building_registry: {
        Args: { p_building_id: string }
        Returns: undefined
      }
      building_units_area_total: {
        Args: { p_building_id: string }
        Returns: number
      }
      cast_vote: {
        Args: { p_choice: string; p_token: string }
        Returns: {
          vote_choice: string
          vote_recorded: boolean
          voted_at: string
        }[]
      }
      import_building_units: {
        Args: { p_building_id: string; p_rows: Json }
        Returns: number
      }
      resolve_voting_link: {
        Args: { p_token: string }
        Returns: {
          building_name: string
          own_vote_choice: string
          own_voted_at: string
          owner_full_name: string
          owner_share_bps: number
          owner_unit_numbers: string[]
          resolution_body: string
          resolution_number: string
          resolution_status: string
          resolution_title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

