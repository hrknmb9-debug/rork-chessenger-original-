-- Linter 0010 security_definer_view 対応
-- ビューのデフォルトは SECURITY DEFINER（作成者権限）のため、RLS をバイパスしうる。
-- security_invoker=on で呼び出し元の権限を使用するように変更。
-- ※ get_profile_match_stats は SECURITY DEFINER のまま（matches 集計のため必要）

CREATE OR REPLACE VIEW public.profiles_with_match_stats
WITH (security_invoker = on)
AS
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
  COALESCE(ms.games_played, 0)::INT AS games_played,
  COALESCE(ms.wins, 0)::INT AS wins,
  COALESCE(ms.losses, 0)::INT AS losses,
  COALESCE(ms.draws, 0)::INT AS draws
FROM public.profiles p
LEFT JOIN LATERAL get_profile_match_stats(p.id) AS ms(games_played, wins, losses, draws) ON true;
