DO $$
DECLARE
  uid uuid := '0065e18b-bb1a-4942-b9b4-1aa2d68c43c0';
BEGIN
  DELETE FROM premium_subscriptions WHERE user_id = uid;
  DELETE FROM strava_activities WHERE user_id = uid;
  DELETE FROM garmin_activities WHERE user_id = uid;
  DELETE FROM apple_health_activities WHERE user_id = uid;
  DELETE FROM terra_activities WHERE user_id = uid;
  DELETE FROM activity_analyses WHERE user_id = uid;
  DELETE FROM personal_bests WHERE user_id = uid;
  DELETE FROM territory_hexes WHERE owner_user_id = uid;
  DELETE FROM territory_captures WHERE user_id = uid;
  DELETE FROM territory_landmark_captures WHERE user_id = uid;
  DELETE FROM ai_coach_conversations WHERE user_id = uid;
  DELETE FROM ai_coach_insights WHERE user_id = uid;
  DELETE FROM ai_coach_usage WHERE user_id = uid;
  DELETE FROM posture_analyses WHERE user_id = uid;
  DELETE FROM social_rewards_claimed WHERE user_id = uid;
  DELETE FROM pushed_workouts WHERE user_id = uid;
  DELETE FROM activity_push_log WHERE user_id = uid;
  DELETE FROM pending_races WHERE submitted_by = uid;
  UPDATE profiles
    SET is_premium = false,
        monthly_xp = 0,
        lifetime_xp = 0,
        training_score = 0,
        check_in_streak = 0,
        last_check_in_date = NULL,
        rank_tier = 'Bronze',
        division = 'V'
    WHERE user_id = uid;
END $$;