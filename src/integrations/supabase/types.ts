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
      activity_analyses: {
        Row: {
          activity_id: string
          analysis_en: string | null
          analysis_zh: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          activity_id: string
          analysis_en?: string | null
          analysis_zh?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          analysis_en?: string | null
          analysis_zh?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          message: string
          message_zh: string | null
          title: string
          title_zh: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          message: string
          message_zh?: string | null
          title: string
          title_zh?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          message?: string
          message_zh?: string | null
          title?: string
          title_zh?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      apple_health_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number
          created_at: string
          distance: number
          elapsed_time: number
          id: string
          max_heartrate: number | null
          max_speed: number
          moving_time: number
          name: string
          source: string | null
          sport_type: string
          start_date: string
          total_elevation_gain: number
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number
          created_at?: string
          distance?: number
          elapsed_time?: number
          id?: string
          max_heartrate?: number | null
          max_speed?: number
          moving_time?: number
          name: string
          source?: string | null
          sport_type?: string
          start_date: string
          total_elevation_gain?: number
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number
          created_at?: string
          distance?: number
          elapsed_time?: number
          id?: string
          max_heartrate?: number | null
          max_speed?: number
          moving_time?: number
          name?: string
          source?: string | null
          sport_type?: string
          start_date?: string
          total_elevation_gain?: number
          user_id?: string
        }
        Relationships: []
      }
      apple_health_connections: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      free_training_plans: {
        Row: {
          created_at: string
          days_per_week: number
          distance: string
          id: string
          plan_data: Json
          target_time: string
          weekly_km_max: number
          weekly_km_min: number
          weeks: number
        }
        Insert: {
          created_at?: string
          days_per_week: number
          distance: string
          id?: string
          plan_data?: Json
          target_time: string
          weekly_km_max: number
          weekly_km_min: number
          weeks?: number
        }
        Update: {
          created_at?: string
          days_per_week?: number
          distance?: string
          id?: string
          plan_data?: Json
          target_time?: string
          weekly_km_max?: number
          weekly_km_min?: number
          weeks?: number
        }
        Relationships: []
      }
      pending_races: {
        Row: {
          ai_verification_result: string | null
          category: string
          city: string
          country: string
          created_at: string
          id: string
          name: string
          race_date: string
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          ai_verification_result?: string | null
          category: string
          city: string
          country: string
          created_at?: string
          id?: string
          name: string
          race_date: string
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          ai_verification_result?: string | null
          category?: string
          city?: string
          country?: string
          created_at?: string
          id?: string
          name?: string
          race_date?: string
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      personal_bests: {
        Row: {
          created_at: string
          distance: string
          hours: number
          id: string
          minutes: number
          race_date: string | null
          seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          distance: string
          hours?: number
          id?: string
          minutes?: number
          race_date?: string | null
          seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          distance?: string
          hours?: number
          id?: string
          minutes?: number
          race_date?: string | null
          seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posture_analyses: {
        Row: {
          created_at: string
          feedback: string | null
          head_score: number
          id: string
          lower_limb_score: number
          overall_score: number
          shoulder_score: number
          torso_score: number
          upper_limb_score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          head_score?: number
          id?: string
          lower_limb_score?: number
          overall_score?: number
          shoulder_score?: number
          torso_score?: number
          upper_limb_score?: number
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          head_score?: number
          id?: string
          lower_limb_score?: number
          overall_score?: number
          shoulder_score?: number
          torso_score?: number
          upper_limb_score?: number
          user_id?: string
        }
        Relationships: []
      }
      premium_subscriptions: {
        Row: {
          activated_at: string
          created_at: string
          expires_at: string
          id: string
          is_trial: boolean
          plan: string
          rc_entitlement: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          created_at?: string
          expires_at: string
          id?: string
          is_trial?: boolean
          plan: string
          rc_entitlement?: string
          user_id: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_trial?: boolean
          plan?: string
          rc_entitlement?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          runs_per_week: number | null
          sex: string | null
          training_score: number | null
          trial_used: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          runs_per_week?: number | null
          sex?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          runs_per_week?: number | null
          sex?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      races: {
        Row: {
          category: string
          city: string
          country: string
          created_at: string
          description: string | null
          id: string
          name: string
          race_date: string
          registration_info: string | null
          source: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          category: string
          city: string
          country: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          race_date: string
          registration_info?: string | null
          source?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          category?: string
          city?: string
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          race_date?: string
          registration_info?: string | null
          source?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      strava_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number
          created_at: string
          distance: number
          elapsed_time: number
          environment: string
          id: string
          max_heartrate: number | null
          max_speed: number
          moving_time: number
          name: string
          sport_type: string
          start_date: string
          strava_id: number
          summary_polyline: string | null
          total_elevation_gain: number
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number
          created_at?: string
          distance?: number
          elapsed_time?: number
          environment?: string
          id?: string
          max_heartrate?: number | null
          max_speed?: number
          moving_time?: number
          name: string
          sport_type?: string
          start_date: string
          strava_id: number
          summary_polyline?: string | null
          total_elevation_gain?: number
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number
          created_at?: string
          distance?: number
          elapsed_time?: number
          environment?: string
          id?: string
          max_heartrate?: number | null
          max_speed?: number
          moving_time?: number
          name?: string
          sport_type?: string
          start_date?: string
          strava_id?: number
          summary_polyline?: string | null
          total_elevation_gain?: number
          user_id?: string
        }
        Relationships: []
      }
      strava_connections: {
        Row: {
          access_token: string
          created_at: string
          environment: string
          expires_at: number
          id: string
          refresh_token: string
          strava_athlete_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          environment?: string
          expires_at: number
          id?: string
          refresh_token: string
          strava_athlete_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          environment?: string
          expires_at?: number
          id?: string
          refresh_token?: string
          strava_athlete_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_feedback: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          name: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      training_plans: {
        Row: {
          created_at: string
          distance: string
          goal: string
          id: string
          plan_data: Json
          race_date: string
          raw_output: string | null
          target_time: string
          updated_at: string
          user_id: string
          weeks: number
        }
        Insert: {
          created_at?: string
          distance: string
          goal: string
          id?: string
          plan_data?: Json
          race_date: string
          raw_output?: string | null
          target_time: string
          updated_at?: string
          user_id: string
          weeks: number
        }
        Update: {
          created_at?: string
          distance?: string
          goal?: string
          id?: string
          plan_data?: Json
          race_date?: string
          raw_output?: string | null
          target_time?: string
          updated_at?: string
          user_id?: string
          weeks?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_posture_averages: {
        Args: never
        Returns: {
          avg_head: number
          avg_lower_limb: number
          avg_overall: number
          avg_shoulder: number
          avg_torso: number
          avg_upper_limb: number
          total_count: number
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
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
