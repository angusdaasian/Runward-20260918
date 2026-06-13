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
      activity_push_log: {
        Row: {
          activity_key: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          activity_key: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          activity_key?: string
          id?: string
          sent_at?: string
          user_id?: string
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
          created_at: string | null
          full_resync_done: boolean
          garmin_display_name: string | null
          garmin_email_encrypted: string | null
          id: string
          last_refreshed_at: string | null
          needs_reauth: boolean
          oauth1_token_encrypted: string | null
          oauth2_token_encrypted: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_resync_done?: boolean
          garmin_display_name?: string | null
          garmin_email_encrypted?: string | null
          id?: string
          last_refreshed_at?: string | null
          needs_reauth?: boolean
          oauth1_token_encrypted?: string | null
          oauth2_token_encrypted?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_resync_done?: boolean
          garmin_display_name?: string | null
          garmin_email_encrypted?: string | null
          id?: string
          last_refreshed_at?: string | null
          needs_reauth?: boolean
          oauth1_token_encrypted?: string | null
          oauth2_token_encrypted?: string | null
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
      intervals_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number | null
          created_at: string
          distance: number | null
          elapsed_time: number | null
          environment: string | null
          id: string
          intervals_id: string
          max_heartrate: number | null
          max_speed: number | null
          moving_time: number | null
          name: string | null
          sport_type: string | null
          start_date: string | null
          summary_polyline: string | null
          total_elevation_gain: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          distance?: number | null
          elapsed_time?: number | null
          environment?: string | null
          id?: string
          intervals_id: string
          max_heartrate?: number | null
          max_speed?: number | null
          moving_time?: number | null
          name?: string | null
          sport_type?: string | null
          start_date?: string | null
          summary_polyline?: string | null
          total_elevation_gain?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          distance?: number | null
          elapsed_time?: number | null
          environment?: string | null
          id?: string
          intervals_id?: string
          max_heartrate?: number | null
          max_speed?: number | null
          moving_time?: number | null
          name?: string | null
          sport_type?: string | null
          start_date?: string | null
          summary_polyline?: string | null
          total_elevation_gain?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intervals_connections: {
        Row: {
          access_token: string
          athlete_id: string
          created_at: string
          expires_at: number
          id: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          athlete_id: string
          created_at?: string
          expires_at: number
          id?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          athlete_id?: string
          created_at?: string
          expires_at?: number
          id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
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
      polar_activities: {
        Row: {
          average_heart_rate: number | null
          calories: number | null
          club_id: number | null
          club_name: string | null
          created_at: string
          detailed_sport_type: string | null
          distance: number | null
          duration: number | null
          has_route: boolean | null
          id: string
          maximum_heart_rate: number | null
          polar_exercise_id: string
          raw: Json | null
          sport_type: string | null
          start_date: string
          training_load: number | null
          upload_time: string | null
          user_id: string
        }
        Insert: {
          average_heart_rate?: number | null
          calories?: number | null
          club_id?: number | null
          club_name?: string | null
          created_at?: string
          detailed_sport_type?: string | null
          distance?: number | null
          duration?: number | null
          has_route?: boolean | null
          id?: string
          maximum_heart_rate?: number | null
          polar_exercise_id: string
          raw?: Json | null
          sport_type?: string | null
          start_date: string
          training_load?: number | null
          upload_time?: string | null
          user_id: string
        }
        Update: {
          average_heart_rate?: number | null
          calories?: number | null
          club_id?: number | null
          club_name?: string | null
          created_at?: string
          detailed_sport_type?: string | null
          distance?: number | null
          duration?: number | null
          has_route?: boolean | null
          id?: string
          maximum_heart_rate?: number | null
          polar_exercise_id?: string
          raw?: Json | null
          sport_type?: string | null
          start_date?: string
          training_load?: number | null
          upload_time?: string | null
          user_id?: string
        }
        Relationships: []
      }
      polar_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: number
          member_id: string
          polar_user_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: number
          member_id: string
          polar_user_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: number
          member_id?: string
          polar_user_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      polar_webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          signature_secret: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id: string
          signature_secret: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          signature_secret?: string
          url?: string
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
          analytics_widgets: Json | null
          avatar_url: string | null
          check_in_streak: number
          created_at: string
          custom_hr_zones: number[] | null
          display_name: string | null
          division: string
          id: string
          is_premium: boolean
          is_trial: boolean
          lang: string
          last_check_in_date: string | null
          last_login: string | null
          lifetime_xp: number
          max_heartrate: number | null
          monthly_goal_km: number
          monthly_xp: number
          onboarding_completed: boolean
          rank_tier: string
          resting_heartrate: number | null
          runs_per_week: number | null
          sex: string | null
          simple_mode: boolean
          telegram_activity_feedback: boolean
          telegram_chat_id: number | null
          telegram_coach_session_id: string | null
          telegram_daily_workout: boolean
          telegram_link_code: string | null
          telegram_link_code_expires_at: string | null
          training_score: number | null
          trial_used: boolean
          updated_at: string
          user_id: string
          whatsapp_activity_feedback: boolean
          whatsapp_coach_session_id: string | null
          whatsapp_daily_workout: boolean
          whatsapp_link_code: string | null
          whatsapp_link_code_expires_at: string | null
          whatsapp_phone_e164: string | null
          whatsapp_wa_id: string | null
        }
        Insert: {
          activity_notifications?: boolean
          age?: number | null
          analytics_widgets?: Json | null
          avatar_url?: string | null
          check_in_streak?: number
          created_at?: string
          custom_hr_zones?: number[] | null
          display_name?: string | null
          division?: string
          id?: string
          is_premium?: boolean
          is_trial?: boolean
          lang?: string
          last_check_in_date?: string | null
          last_login?: string | null
          lifetime_xp?: number
          max_heartrate?: number | null
          monthly_goal_km?: number
          monthly_xp?: number
          onboarding_completed?: boolean
          rank_tier?: string
          resting_heartrate?: number | null
          runs_per_week?: number | null
          sex?: string | null
          simple_mode?: boolean
          telegram_activity_feedback?: boolean
          telegram_chat_id?: number | null
          telegram_coach_session_id?: string | null
          telegram_daily_workout?: boolean
          telegram_link_code?: string | null
          telegram_link_code_expires_at?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id: string
          whatsapp_activity_feedback?: boolean
          whatsapp_coach_session_id?: string | null
          whatsapp_daily_workout?: boolean
          whatsapp_link_code?: string | null
          whatsapp_link_code_expires_at?: string | null
          whatsapp_phone_e164?: string | null
          whatsapp_wa_id?: string | null
        }
        Update: {
          activity_notifications?: boolean
          age?: number | null
          analytics_widgets?: Json | null
          avatar_url?: string | null
          check_in_streak?: number
          created_at?: string
          custom_hr_zones?: number[] | null
          display_name?: string | null
          division?: string
          id?: string
          is_premium?: boolean
          is_trial?: boolean
          lang?: string
          last_check_in_date?: string | null
          last_login?: string | null
          lifetime_xp?: number
          max_heartrate?: number | null
          monthly_goal_km?: number
          monthly_xp?: number
          onboarding_completed?: boolean
          rank_tier?: string
          resting_heartrate?: number | null
          runs_per_week?: number | null
          sex?: string | null
          simple_mode?: boolean
          telegram_activity_feedback?: boolean
          telegram_chat_id?: number | null
          telegram_coach_session_id?: string | null
          telegram_daily_workout?: boolean
          telegram_link_code?: string | null
          telegram_link_code_expires_at?: string | null
          training_score?: number | null
          trial_used?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_activity_feedback?: boolean
          whatsapp_coach_session_id?: string | null
          whatsapp_daily_workout?: boolean
          whatsapp_link_code?: string | null
          whatsapp_link_code_expires_at?: string | null
          whatsapp_phone_e164?: string | null
          whatsapp_wa_id?: string | null
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
      pushed_workouts: {
        Row: {
          day_index: number
          id: string
          plan_id: string
          provider: string
          pushed_at: string
          terra_log_id: string | null
          user_id: string
          week: number
        }
        Insert: {
          day_index: number
          id?: string
          plan_id: string
          provider: string
          pushed_at?: string
          terra_log_id?: string | null
          user_id: string
          week: number
        }
        Update: {
          day_index?: number
          id?: string
          plan_id?: string
          provider?: string
          pushed_at?: string
          terra_log_id?: string | null
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "pushed_workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
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
      roadmap_ideas: {
        Row: {
          created_at: string
          id: string
          idea: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idea: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idea?: string
          user_id?: string
        }
        Relationships: []
      }
      social_rewards_claimed: {
        Row: {
          claimed_at: string
          id: string
          reward_key: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          claimed_at?: string
          id?: string
          reward_key: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          claimed_at?: string
          id?: string
          reward_key?: string
          user_id?: string
          xp_awarded?: number
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
      strava_apps: {
        Row: {
          client_id: string
          client_secret: string | null
          client_secret_vault_id: string | null
          created_at: string
          id: string
          is_active: boolean
          max_athletes: number
          notes: string | null
          priority: number
          subscription_id: number | null
          updated_at: string
          verify_token: string | null
          verify_token_vault_id: string | null
        }
        Insert: {
          client_id: string
          client_secret?: string | null
          client_secret_vault_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_athletes?: number
          notes?: string | null
          priority?: number
          subscription_id?: number | null
          updated_at?: string
          verify_token?: string | null
          verify_token_vault_id?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string | null
          client_secret_vault_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_athletes?: number
          notes?: string | null
          priority?: number
          subscription_id?: number | null
          updated_at?: string
          verify_token?: string | null
          verify_token_vault_id?: string | null
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
          strava_app_id: string | null
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
          strava_app_id?: string | null
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
          strava_app_id?: string | null
          strava_athlete_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strava_connections_strava_app_id_fkey"
            columns: ["strava_app_id"]
            isOneToOne: false
            referencedRelation: "strava_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      support_feedback: {
        Row: {
          admin_response: string | null
          created_at: string
          description: string
          id: string
          name: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          description: string
          id?: string
          name?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      suunto_activities: {
        Row: {
          activity_id: number | null
          average_heartrate: number | null
          average_speed: number | null
          cadence_samples: Json | null
          created_at: string
          distance: number | null
          distance_samples: Json | null
          elapsed_time: number | null
          elevation_samples: Json | null
          environment: string
          has_details: boolean
          hr_samples: Json | null
          id: string
          max_heartrate: number | null
          max_speed: number | null
          moving_time: number | null
          name: string | null
          sport_type: string
          start_date: string
          summary_polyline: string | null
          suunto_workout_key: string
          total_elevation_gain: number | null
          user_id: string
        }
        Insert: {
          activity_id?: number | null
          average_heartrate?: number | null
          average_speed?: number | null
          cadence_samples?: Json | null
          created_at?: string
          distance?: number | null
          distance_samples?: Json | null
          elapsed_time?: number | null
          elevation_samples?: Json | null
          environment?: string
          has_details?: boolean
          hr_samples?: Json | null
          id?: string
          max_heartrate?: number | null
          max_speed?: number | null
          moving_time?: number | null
          name?: string | null
          sport_type?: string
          start_date: string
          summary_polyline?: string | null
          suunto_workout_key: string
          total_elevation_gain?: number | null
          user_id: string
        }
        Update: {
          activity_id?: number | null
          average_heartrate?: number | null
          average_speed?: number | null
          cadence_samples?: Json | null
          created_at?: string
          distance?: number | null
          distance_samples?: Json | null
          elapsed_time?: number | null
          elevation_samples?: Json | null
          environment?: string
          has_details?: boolean
          hr_samples?: Json | null
          id?: string
          max_heartrate?: number | null
          max_speed?: number | null
          moving_time?: number | null
          name?: string | null
          sport_type?: string
          start_date?: string
          summary_polyline?: string | null
          suunto_workout_key?: string
          total_elevation_gain?: number | null
          user_id?: string
        }
        Relationships: []
      }
      suunto_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: number
          id: string
          refresh_token: string
          suunto_username: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: number
          id?: string
          refresh_token: string
          suunto_username: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: number
          id?: string
          refresh_token?: string
          suunto_username?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_pending_prompts: {
        Row: {
          activity_db_id: string | null
          activity_key: string
          activity_source: string
          activity_summary: Json
          chat_id: number
          created_at: string
          expires_at: string
          id: string
          prompt_message_id: number | null
          responded_at: string | null
          response_text: string | null
          rpe: number | null
          user_id: string
        }
        Insert: {
          activity_db_id?: string | null
          activity_key: string
          activity_source: string
          activity_summary?: Json
          chat_id: number
          created_at?: string
          expires_at?: string
          id?: string
          prompt_message_id?: number | null
          responded_at?: string | null
          response_text?: string | null
          rpe?: number | null
          user_id: string
        }
        Update: {
          activity_db_id?: string | null
          activity_key?: string
          activity_source?: string
          activity_summary?: Json
          chat_id?: number
          created_at?: string
          expires_at?: string
          id?: string
          prompt_message_id?: number | null
          responded_at?: string | null
          response_text?: string | null
          rpe?: number | null
          user_id?: string
        }
        Relationships: []
      }
      terra_activities: {
        Row: {
          activity_name: string | null
          activity_type: string | null
          aerobic_te: number | null
          anaerobic_te: number | null
          average_hr: number | null
          average_speed: number | null
          avg_cadence: number | null
          cadence_samples: Json | null
          calories: number | null
          created_at: string
          distance_meters: number | null
          distance_samples: Json | null
          duration_seconds: number | null
          elevation_gain: number | null
          elevation_samples: Json | null
          has_gps: boolean | null
          hr_samples: Json | null
          id: string
          laps: Json | null
          max_hr: number | null
          provider: string
          raw_json: Json | null
          start_time: string | null
          summary_polyline: string | null
          terra_activity_id: string
          training_load: number | null
          user_id: string
          vo2max: number | null
        }
        Insert: {
          activity_name?: string | null
          activity_type?: string | null
          aerobic_te?: number | null
          anaerobic_te?: number | null
          average_hr?: number | null
          average_speed?: number | null
          avg_cadence?: number | null
          cadence_samples?: Json | null
          calories?: number | null
          created_at?: string
          distance_meters?: number | null
          distance_samples?: Json | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          elevation_samples?: Json | null
          has_gps?: boolean | null
          hr_samples?: Json | null
          id?: string
          laps?: Json | null
          max_hr?: number | null
          provider: string
          raw_json?: Json | null
          start_time?: string | null
          summary_polyline?: string | null
          terra_activity_id: string
          training_load?: number | null
          user_id: string
          vo2max?: number | null
        }
        Update: {
          activity_name?: string | null
          activity_type?: string | null
          aerobic_te?: number | null
          anaerobic_te?: number | null
          average_hr?: number | null
          average_speed?: number | null
          avg_cadence?: number | null
          cadence_samples?: Json | null
          calories?: number | null
          created_at?: string
          distance_meters?: number | null
          distance_samples?: Json | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          elevation_samples?: Json | null
          has_gps?: boolean | null
          hr_samples?: Json | null
          id?: string
          laps?: Json | null
          max_hr?: number | null
          provider?: string
          raw_json?: Json | null
          start_time?: string | null
          summary_polyline?: string | null
          terra_activity_id?: string
          training_load?: number | null
          user_id?: string
          vo2max?: number | null
        }
        Relationships: []
      }
      terra_connections: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_synced_at: string | null
          last_webhook_at: string | null
          provider: string
          reference_id: string | null
          scopes: string[] | null
          terra_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          last_webhook_at?: string | null
          provider: string
          reference_id?: string | null
          scopes?: string[] | null
          terra_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string | null
          last_webhook_at?: string | null
          provider?: string
          reference_id?: string | null
          scopes?: string[] | null
          terra_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terra_daily_health: {
        Row: {
          date: string
          fetched_at: string
          hrv: number | null
          id: string
          provider: string
          resting_hr: number | null
          sleep_score: number | null
          sleep_seconds: number | null
          steps: number | null
          user_id: string
          vo2max: number | null
        }
        Insert: {
          date: string
          fetched_at?: string
          hrv?: number | null
          id?: string
          provider: string
          resting_hr?: number | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          steps?: number | null
          user_id: string
          vo2max?: number | null
        }
        Update: {
          date?: string
          fetched_at?: string
          hrv?: number | null
          id?: string
          provider?: string
          resting_hr?: number | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          steps?: number | null
          user_id?: string
          vo2max?: number | null
        }
        Relationships: []
      }
      terra_data_payloads: {
        Row: {
          created_at: string | null
          data_type: string | null
          end_time: string | null
          payload_id: string
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_type?: string | null
          end_time?: string | null
          payload_id: string
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_type?: string | null
          end_time?: string | null
          payload_id?: string
          start_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_data_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "terra_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      terra_inactivity_notifications: {
        Row: {
          created_at: string
          days_inactive: number
          id: string
          provider: string
          sent_on: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_inactive: number
          id?: string
          provider: string
          sent_on: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_inactive?: number
          id?: string
          provider?: string
          sent_on?: string
          user_id?: string
        }
        Relationships: []
      }
      terra_misc_payloads: {
        Row: {
          created_at: string | null
          data_type: string | null
          payload_id: string
          payload_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_type?: string | null
          payload_id: string
          payload_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_type?: string | null
          payload_id?: string
          payload_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_misc_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "terra_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      terra_reconciliation_log: {
        Row: {
          created_at: string
          data_type: string | null
          detail: string | null
          id: string
          payload_id: string
          source_table: string
          status: string
          terra_user_id: string | null
        }
        Insert: {
          created_at?: string
          data_type?: string | null
          detail?: string | null
          id?: string
          payload_id: string
          source_table: string
          status: string
          terra_user_id?: string | null
        }
        Update: {
          created_at?: string
          data_type?: string | null
          detail?: string | null
          id?: string
          payload_id?: string
          source_table?: string
          status?: string
          terra_user_id?: string | null
        }
        Relationships: []
      }
      terra_sync_usage: {
        Row: {
          called_at: string
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          called_at?: string
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          called_at?: string
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      terra_today_oneoff_queue: {
        Row: {
          attempted_at: string | null
          created_at: string
          http_status: number | null
          id: string
          provider: string
          result: string | null
          status: string
          target_date: string
          terra_reference: string | null
          terra_user_id: string
          user_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          provider: string
          result?: string | null
          status?: string
          target_date: string
          terra_reference?: string | null
          terra_user_id: string
          user_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          provider?: string
          result?: string | null
          status?: string
          target_date?: string
          terra_reference?: string | null
          terra_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      terra_users: {
        Row: {
          created_at: string | null
          granted_scopes: string | null
          provider: string | null
          reference_id: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_scopes?: string | null
          provider?: string | null
          reference_id?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_scopes?: string | null
          provider?: string | null
          reference_id?: string | null
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      terra_webhook_events: {
        Row: {
          id: string
          payload: Json | null
          payload_ids: string[] | null
          processing_error: string | null
          received_at: string
          reference_id: string | null
          signature_valid: boolean | null
          terra_user_id: string | null
          type: string | null
        }
        Insert: {
          id?: string
          payload?: Json | null
          payload_ids?: string[] | null
          processing_error?: string | null
          received_at?: string
          reference_id?: string | null
          signature_valid?: boolean | null
          terra_user_id?: string | null
          type?: string | null
        }
        Update: {
          id?: string
          payload?: Json | null
          payload_ids?: string[] | null
          processing_error?: string | null
          received_at?: string
          reference_id?: string | null
          signature_valid?: boolean | null
          terra_user_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      terra_webhook_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          env: string
          id: string
          last_error: string | null
          processed_at: string | null
          raw_body: string
          received_at: string
          signature_header: string | null
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          env: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          raw_body: string
          received_at?: string
          signature_header?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          env?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          raw_body?: string
          received_at?: string
          signature_header?: string | null
          status?: string
        }
        Relationships: []
      }
      territory_captures: {
        Row: {
          activity_id: string | null
          captured_at: string
          hex_id: string
          id: string
          region: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          captured_at?: string
          hex_id: string
          id?: string
          region: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          captured_at?: string
          hex_id?: string
          id?: string
          region?: string
          user_id?: string
        }
        Relationships: []
      }
      territory_cities: {
        Row: {
          admin1: string | null
          bbox: Json
          center_lat: number
          center_lng: number
          country: string | null
          created_at: string
          display_name: string
          display_name_zh: string | null
          polygon_filled_at: string | null
          slug: string
          total_hex_count: number
        }
        Insert: {
          admin1?: string | null
          bbox: Json
          center_lat: number
          center_lng: number
          country?: string | null
          created_at?: string
          display_name: string
          display_name_zh?: string | null
          polygon_filled_at?: string | null
          slug: string
          total_hex_count?: number
        }
        Update: {
          admin1?: string | null
          bbox?: Json
          center_lat?: number
          center_lng?: number
          country?: string | null
          created_at?: string
          display_name?: string
          display_name_zh?: string | null
          polygon_filled_at?: string | null
          slug?: string
          total_hex_count?: number
        }
        Relationships: []
      }
      territory_city_hexes: {
        Row: {
          city_slug: string
          created_at: string
          hex_id: string
        }
        Insert: {
          city_slug: string
          created_at?: string
          hex_id: string
        }
        Update: {
          city_slug?: string
          created_at?: string
          hex_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "territory_city_hexes_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "territory_cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      territory_hexes: {
        Row: {
          capture_count: number
          captured_activity_id: string | null
          captured_at: string
          city_slug: string | null
          hex_id: string
          id: string
          owner_display_name: string | null
          owner_user_id: string
          region: string
        }
        Insert: {
          capture_count?: number
          captured_activity_id?: string | null
          captured_at?: string
          city_slug?: string | null
          hex_id: string
          id?: string
          owner_display_name?: string | null
          owner_user_id: string
          region: string
        }
        Update: {
          capture_count?: number
          captured_activity_id?: string | null
          captured_at?: string
          city_slug?: string | null
          hex_id?: string
          id?: string
          owner_display_name?: string | null
          owner_user_id?: string
          region?: string
        }
        Relationships: []
      }
      territory_landmark_captures: {
        Row: {
          activity_id: string | null
          first_captured_at: string
          hex_id: string
          id: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          first_captured_at?: string
          hex_id: string
          id?: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          first_captured_at?: string
          hex_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "territory_landmark_captures_hex_id_fkey"
            columns: ["hex_id"]
            isOneToOne: false
            referencedRelation: "territory_landmarks"
            referencedColumns: ["hex_id"]
          },
        ]
      }
      territory_landmarks: {
        Row: {
          category: string
          city_slug: string | null
          country: string | null
          created_at: string
          hex_id: string
          icon: string | null
          lat: number
          lng: number
          name: string
          name_zh: string | null
          osm_id: number | null
          osm_type: string | null
        }
        Insert: {
          category: string
          city_slug?: string | null
          country?: string | null
          created_at?: string
          hex_id: string
          icon?: string | null
          lat: number
          lng: number
          name: string
          name_zh?: string | null
          osm_id?: number | null
          osm_type?: string | null
        }
        Update: {
          category?: string
          city_slug?: string | null
          country?: string | null
          created_at?: string
          hex_id?: string
          icon?: string | null
          lat?: number
          lng?: number
          name?: string
          name_zh?: string | null
          osm_id?: number | null
          osm_type?: string | null
        }
        Relationships: []
      }
      territory_processed_activities: {
        Row: {
          activity_id: string
          activity_source: string
          id: string
          processed_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          activity_source: string
          id?: string
          processed_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          activity_source?: string
          id?: string
          processed_at?: string
          user_id?: string
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
          race_date: string | null
          race_schedule: Json
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
          race_date?: string | null
          race_schedule?: Json
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
          race_date?: string | null
          race_schedule?: Json
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
      user_races: {
        Row: {
          category: string
          city: string | null
          country: string | null
          created_at: string
          distance_km: number | null
          elevation_m: number | null
          finish_activity_id: string | null
          finish_time_seconds: number | null
          finish_time_source: string | null
          id: string
          notes: string | null
          priority: string
          race_date: string
          race_name: string
          race_name_zh: string | null
          source: string
          source_race_id: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          distance_km?: number | null
          elevation_m?: number | null
          finish_activity_id?: string | null
          finish_time_seconds?: number | null
          finish_time_source?: string | null
          id?: string
          notes?: string | null
          priority?: string
          race_date: string
          race_name: string
          race_name_zh?: string | null
          source?: string
          source_race_id?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          distance_km?: number | null
          elevation_m?: number | null
          finish_activity_id?: string | null
          finish_time_seconds?: number | null
          finish_time_source?: string | null
          id?: string
          notes?: string | null
          priority?: string
          race_date?: string
          race_name?: string
          race_name_zh?: string | null
          source?: string
          source_race_id?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
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
      weekly_plan_reviews: {
        Row: {
          completion_pct: number
          created_at: string
          distance_score: number
          hr_score: number
          id: string
          insights_en: string | null
          insights_zh: string | null
          overall_score: number
          pace_score: number
          plan_id: string
          recovery_score: number
          stats: Json
          updated_at: string
          user_id: string
          week_end: string
          week_index: number
          week_start: string
        }
        Insert: {
          completion_pct?: number
          created_at?: string
          distance_score?: number
          hr_score?: number
          id?: string
          insights_en?: string | null
          insights_zh?: string | null
          overall_score?: number
          pace_score?: number
          plan_id: string
          recovery_score?: number
          stats?: Json
          updated_at?: string
          user_id: string
          week_end: string
          week_index: number
          week_start: string
        }
        Update: {
          completion_pct?: number
          created_at?: string
          distance_score?: number
          hr_score?: number
          id?: string
          insights_en?: string | null
          insights_zh?: string | null
          overall_score?: number
          pace_score?: number
          plan_id?: string
          recovery_score?: number
          stats?: Json
          updated_at?: string
          user_id?: string
          week_end?: string
          week_index?: number
          week_start?: string
        }
        Relationships: []
      }
      whatsapp_pending_prompts: {
        Row: {
          activity_db_id: string | null
          activity_key: string
          activity_source: string
          activity_summary: Json | null
          created_at: string
          expires_at: string
          id: string
          prompt_message_id: string | null
          responded_at: string | null
          response_text: string | null
          rpe: number | null
          user_id: string
          wa_id: string
        }
        Insert: {
          activity_db_id?: string | null
          activity_key: string
          activity_source: string
          activity_summary?: Json | null
          created_at?: string
          expires_at?: string
          id?: string
          prompt_message_id?: string | null
          responded_at?: string | null
          response_text?: string | null
          rpe?: number | null
          user_id: string
          wa_id: string
        }
        Update: {
          activity_db_id?: string | null
          activity_key?: string
          activity_source?: string
          activity_summary?: Json | null
          created_at?: string
          expires_at?: string
          id?: string
          prompt_message_id?: string | null
          responded_at?: string | null
          response_text?: string | null
          rpe?: number | null
          user_id?: string
          wa_id?: string
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
      claim_terra_webhook_queue: {
        Args: { batch_size: number }
        Returns: {
          attempts: number
          env: string
          id: string
          raw_body: string
          signature_header: string
        }[]
      }
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
      get_strava_app_secrets: {
        Args: { p_app_id: string }
        Returns: {
          client_secret: string
          verify_token: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_reset_season: { Args: { p_month_year?: string }; Returns: number }
      set_strava_app_secret: {
        Args: { p_app_id: string; p_kind: string; p_value: string }
        Returns: undefined
      }
      unschedule_cron_job: { Args: { job_name: string }; Returns: undefined }
      unschedule_terra_today_oneoff: { Args: never; Returns: undefined }
      unschedule_terra_webhook_cleanup: { Args: never; Returns: undefined }
      unschedule_terra_webhook_drain: { Args: never; Returns: undefined }
      user_has_other_fitness_provider: {
        Args: { _exclude: string; _user_id: string }
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
