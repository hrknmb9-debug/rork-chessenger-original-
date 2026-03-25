-- matches テーブルを正とするマッチ数を表示するビュー
-- profiles.games_played がトリガーと同期していない場合でも、常に正しい値を返す

CREATE OR REPLACE VIEW public.profiles_with_match_stats AS
SELECT
  p.id,
  p.name,
  p.email,
  p.avatar,
  p.bio,
  p.bio_en,
  p.rating,
  p.chess_com_rating,
  p.lichess_rating,
  p.skill_level,
  p.preferred_time_control,
  p.location,
  p.latitude,
  p.longitude,
  p.languages,
  p.country,
  p.play_styles,
  p.is_online,
  p.last_active,
  p.last_seen,
  p.expo_push_token,
  p.created_at,
  COALESCE(ms.gp, 0)::INT AS games_played,
  COALESCE(ms.w, 0)::INT AS wins,
  COALESCE(ms.l, 0)::INT AS losses,
  COALESCE(ms.d, 0)::INT AS draws
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE m.status = 'completed')::INT AS gp,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id = p.id)::INT AS w,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id IS NOT NULL AND m.winner_id != p.id)::INT AS l,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND (m.winner_id IS NULL OR m.result = 'draw'))::INT AS d
  FROM public.matches m
  WHERE m.requester_id = p.id OR m.opponent_id = p.id
) ms ON true;

-- RLS: ビューは基テーブルのポリシーを継承するが、明示的に SELECT を許可
GRANT SELECT ON public.profiles_with_match_stats TO anon;
GRANT SELECT ON public.profiles_with_match_stats TO authenticated;
