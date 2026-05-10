
INSERT INTO public.strava_activities (user_id, strava_id, name, sport_type, distance, moving_time, elapsed_time, total_elevation_gain, start_date, average_speed, max_speed, average_heartrate, max_heartrate, summary_polyline, environment) VALUES
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 9000000001, '清晨維港長跑', 'Run', 10500, 3150, 3300, 45, now() - interval '1 day', 3.33, 4.5, 158, 178, 'qfwjFuuyiM~@aB|@oBz@uBp@cCh@iCb@oCXuC@yC[wCs@oCcAeCmAuBwAeBeBkAoBu@uBYuB@uBV', 'outdoor'),
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 9000000002, '中環海濱輕鬆跑', 'Run', 6200, 2100, 2200, 12, now() - interval '3 days', 2.95, 4.0, 145, 165, 'qfwjFuuyiM~@aB|@oBz@uBp@cC', 'outdoor'),
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 9000000003, '山頂訓練 Tempo', 'Run', 8800, 2640, 2800, 220, now() - interval '5 days', 3.33, 4.8, 168, 185, 'qfwjFuuyiM', 'outdoor'),
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 9000000004, '週末長距離 LSD', 'Run', 18200, 6300, 6500, 80, now() - interval '7 days', 2.89, 4.2, 152, 172, 'qfwjFuuyiM', 'outdoor'),
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 9000000005, '間歇訓練 400m x 8', 'Run', 7400, 2200, 2700, 30, now() - interval '10 days', 3.36, 5.5, 171, 188, 'qfwjFuuyiM', 'outdoor');

INSERT INTO public.activity_analyses (user_id, activity_id, analysis_zh, analysis_en, next_workout_zh, next_workout_en) 
SELECT
  '0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', id,
  '今次 10.5 公里長跑表現亮眼！平均配速 5:00/km，比上週進步 12 秒/km，心率區間集中在 Z2-Z3，屬於有效的有氧基礎訓練。爬升 45 米控制得當，後段未見明顯掉速，顯示耐力提升中。建議下一次訓練加入節奏跑提高乳酸閾值。',
  'Great 10.5km run! Average pace 5:00/km, 12 sec/km faster than last week. HR mostly in Z2-Z3, an effective aerobic base session.',
  '建議下一次：6 公里 Tempo Run，配速控制在 4:40/km，心率 Z3-Z4，作為閾值刺激。',
  'Next: 6km Tempo Run @ 4:40/km, Z3-Z4 HR.'
FROM public.strava_activities WHERE strava_id = 9000000001;

INSERT INTO public.posture_analyses (user_id, overall_score, head_score, shoulder_score, upper_limb_score, torso_score, lower_limb_score, feedback) VALUES
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 82, 85, 78, 80, 88, 79, '整體跑姿良好，軀幹核心穩定度高。建議放鬆肩膀，避免過度緊繃。'),
('0065e18b-bb1a-4942-b9b4-1aa2d68c43c0', 78, 80, 75, 76, 82, 77, '頭部位置略前傾，建議下巴微收，視線望向前方 20 米。');

UPDATE public.profiles
SET display_name = 'Runward 示範', age = 28, sex = 'male', runs_per_week = 4,
    monthly_goal_km = 80, max_heartrate = 192, resting_heartrate = 58,
    onboarding_completed = true, monthly_xp = 2450, lifetime_xp = 18900,
    rank_tier = 'Silver', division = 'II'
WHERE user_id = '0065e18b-bb1a-4942-b9b4-1aa2d68c43c0';
