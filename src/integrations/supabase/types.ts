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
          next_workout_en: string | null
          next_workout_zh: string | null
          race_id: string | null
          race_name: string | null
          user_comment: string | null
          user_id: string
          weather: Json | null
        }
        Insert: {
          activity_id: string
          analysis_en?: string | null
          analysis_zh?: string | null
          created_at?: string
          id?: string
          next_workout_en?: string | null
          next_workout_zh?: string | null
          race_id?: string | null
          race_name?: string | null
          user_comment?: string | null
          user_id: string
          weather?: Json | null
        }
        Update: {
          activity_id?: string
          analysis_en?: string | null
          analysis_zh?: string | null
          created_at?: string
          id?: string
          next_workout_en?: string | null
          next_workout_zh?: string | null
          race_id?: string | null
          race_name?: string | null
          user_comment?: string | null
          user_id?: string
          weather?: Json | null
        }
        Relationships: []
      }
      ai_coach_conversations: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_coach_insights: {
        Row: {
          confidence: number
          created_at: string
          id: string
          insight_key: string
          insight_type: string
          insight_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          insight_key: string
          insight_type: string
          insight_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          insight_key?: string
          insight_type?: string
          insight_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_coach_preferences: {
        Row: {
          created_at: string
          experience_level: string | null
          id: string
          injuries_concerns: string | null
          preferred_units: string
          target_race_date: string | null
          thinking_level: string
          training_days: Json
          training_goal: string | null
          training_intensity: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          experience_level?: string | null
          id?: string
          injuries_concerns?: string | null
          preferred_units?: string
          target_race_date?: string | null
          thinking_level?: string
          training_days?: Json
          training_goal?: string | null
          training_intensity?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          experience_level?: string | null
          id?: string
          injuries_concerns?: string | null
          preferred_units?: string
          target_race_date?: string | null
          thinking_level?: string
          training_days?: Json
          training_goal?: string | null
          training_intensity?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_coach_usage: {
        Row: {
          created_at: string
          date: string
          id: string
          message_count: number
          thinking_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          message_count?: number
          thinking_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          message_count?: number
          thinking_level?: string
          updated_at?: string
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
          calories: number | null
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
          calories?: number | null
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
          calories?: number | null
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
      debug_logs: {
        Row: {
          created_at: string | null
          id: string
          message: string
          payload: Json | null
          tag: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          payload?: Json | null
          tag: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          payload?: Json | null
          tag?: string
          user_id?: string | null
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
      garmin_activities: {
        Row: {
          activity_name: string | null
          activity_type: string | null
          aerobic_te: number | null
          anaerobic_te: number | null
          average_hr: number | null
          average_pace: number | null
          average_speed: number | null
          avg_cadence: number | null
          calories: number | null
          created_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain: number | null
          garmin_activity_id: string
          has_details: boolean
          has_gps: boolean | null
          id: string
          laps: Json | null
          max_hr: number | null
          raw_json: Json | null
          start_time: string | null
          summary_polyline: string | null
          training_load: number | null
          user_id: string
          vo2max: number | null
          weather: Json | null
        }
        Insert: {
          activity_name?: string | null
          activity_type?: string | null
          aerobic_te?: number | null
          anaerobic_te?: number | null
          average_hr?: number | null
          average_pace?: number | null
          average_speed?: number | null
          avg_cadence?: number | null
          calories?: number | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          garmin_activity_id: string
          has_details?: boolean
          has_gps?: boolean | null
          id?: string
          laps?: Json | null
          max_hr?: number | null
          raw_json?: Json | null
          start_time?: string | null
          summary_polyline?: string | null
          training_load?: number | null
          user_id: string
          vo2max?: number | null
          weather?: Json | null
        }
        Update: {
          activity_name?: string | null
          activity_type?: string | null
          aerobic_te?: number | null
          anaerobic_te?: number | null
          average_hr?: number | null
          average_pace?: number | null
          average_speed?: number | null
          avg_cadence?: number | null
          calories?: number | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          garmin_activity_id?: string
          has_details?: boolean
          has_gps?: boolean | null
          id?: string
          laps?: Json | null
          max_hr?: number | null
          raw_json?: Json | null
          start_time?: string | null
          summary_polyline?: string | null
          training_load?: number | null
          user_id?: string
          vo2max?: number | null
          weather?: Json | null
        }
        Relationships: []
      }
      garmin_connections: {
        Row: {
          access_token: string | null
          created_at: string | null
          expires_at: string | null
          full_resync_done: boolean
          garmin_display_name: string | null
          garmin_email_encrypted: string | null
          id: string
          last_refreshed_at: string | null
          needs_reauth: boolean
          oauth1_token_encrypted: string | null
          oauth2_token_encrypted: string | null
          refresh_token: string | null
          refresh_token_expires_at: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          full_resync_done?: boolean
          garmin_display_name?: string | null
          garmin_email_encrypted?: string | null
          id?: string
          last_refreshed_at?: string | null
          needs_reauth?: boolean
          oauth1_token_encrypted?: string | null
          oauth2_token_encrypted?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          full_resync_done?: boolean
          garmin_display_name?: string | null
          garmin_email_encrypted?: string | null
          id?: string
          last_refreshed_at?: string | null
          needs_reauth?: boolean
          oauth1_token_encrypted?: string | null
          oauth2_token_encrypted?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      garmin_daily_health: {
        Row: {
          date: string
          fetched_at: string
          id: string
          resting_hr: number | null
          sleep_score: number | null
          sleep_seconds: number | null
          user_id: string
          vo2max: number | null
        }
        Insert: {
          date: string
          fetched_at?: string
          id?: string
          resting_hr?: number | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          user_id: string
          vo2max?: number | null
        }
        Update: {
          date?: string
          fetched_at?: string
          id?: string
          resting_hr?: number | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          user_id?: string
          vo2max?: number | null
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
          activity_notifications: boolean
          age: number | null
          avatar_url: string | null
          check_in_streak: number
          created_at: string
          display_name: string | null
          division: string
          id: string
          is_premium: boolean
          last_check_in_date: string | null
          last_login: string | null
          lifetime_xp: number
          monthly_goal_km: number
          monthly_xp: number
          onboarding_completed: boolean
          rank_tier: string
          runs_per_week: number | null
          sex: string | null
          training_score: number | null
          trial_used: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_notifications?: boolean
          age?: number | null
          avatar_url?: string | null
          check_in_streak?: number
          created_at?: string
          display_name?: string | null
          division?: string
          id?: string
          is_premium?: boolean
          last_check_in_date?: string | null
          last_login?: string | null
          lifetime_xp?: number
          monthly_goal_km?: number
          monthly_xp?: number
          onboarding_completed?: boolean
          rank_tier?: string
          runs_per_week?: number | null
          sex?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_notifications?: boolean
          age?: number | null
          avatar_url?: string | null
          check_in_streak?: number
          created_at?: string
          display_name?: string | null
          division?: string
          id?: string
          is_premium?: boolean
          last_check_in_date?: string | null
          last_login?: string | null
          lifetime_xp?: number
          monthly_goal_km?: number
          monthly_xp?: number
          onboarding_completed?: boolean
          rank_tier?: string
          runs_per_week?: number | null
          sex?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_banners: {
        Row: {
          caption: string | null
          caption_zh: string | null
          created_at: string
          created_by: string
          display_order: number
          ends_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          caption_zh?: string | null
          created_at?: string
          created_by: string
          display_order?: number
          ends_at: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          caption_zh?: string | null
          created_at?: string
          created_by?: string
          display_order?: number
          ends_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          updated_at?: string
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
          name_zh: string | null
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
          name_zh?: string | null
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
          name_zh?: string | null
          race_date?: string
          registration_info?: string | null
          source?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      reward_codes: {
        Row: {
          assigned_at: string | null
          code_string: string
          created_at: string
          id: string
          is_assigned: boolean
          month_year: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          code_string: string
          created_at?: string
          id?: string
          is_assigned?: boolean
          month_year?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          code_string?: string
          created_at?: string
          id?: string
          is_assigned?: boolean
          month_year?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sahha_connections: {
        Row: {
          connected_at: string
          external_id: string
          id: string
          last_synced_at: string | null
          profile_token: string | null
          refresh_token: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string
          external_id: string
          id?: string
          last_synced_at?: string | null
          profile_token?: string | null
          refresh_token?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string
          external_id?: string
          id?: string
          last_synced_at?: string | null
          profile_token?: string | null
          refresh_token?: string | null
          user_id?: string
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
      used_codes: {
        Row: {
          assigned_at: string | null
          code_string: string
          created_at: string
          id: string
          month_year: string | null
          original_code_id: string | null
          type: string
          used_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          code_string: string
          created_at?: string
          id?: string
          month_year?: string | null
          original_code_id?: string | null
          type?: string
          used_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          code_string?: string
          created_at?: string
          id?: string
          month_year?: string | null
          original_code_id?: string | null
          type?: string
          used_at?: string
          user_id?: string
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
      leaderboard_view: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          division: string | null
          is_premium: boolean | null
          lifetime_xp: number | null
          monthly_xp: number | null
          rank_tier: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          division?: string | null
          is_premium?: boolean | null
          lifetime_xp?: number | null
          monthly_xp?: number | null
          rank_tier?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          division?: string | null
          is_premium?: boolean | null
          lifetime_xp?: number | null
          monthly_xp?: number | null
          rank_tier?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_leaderboard: {
        Args: { p_is_premium: boolean; p_limit: number }
        Returns: {
          avatar_url: string
          display_name: string
          is_premium: boolean
          monthly_xp: number
          user_id: string
        }[]
      }
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
