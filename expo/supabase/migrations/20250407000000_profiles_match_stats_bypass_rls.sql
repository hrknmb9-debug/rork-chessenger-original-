-- 原因: matches の RLS「当事者のみ読める」により、他プレイヤーのマッチが参照できず
-- ビューの LATERAL JOIN で集計すると常に 0 になる。
-- 対策: SECURITY DEFINER 関数で集計し、RLS をバイパスする。

-- 1. プロフィールIDに対するマッチ集計を返す関数（SECURITY DEFINER = 所有者権限で実行、RLSバイパス）
CREATE OR REPLACE FUNCTION public.get_profile_match_stats(p_profile_id uuid)
RETURNS TABLE(games_played int, wins int, losses int, draws int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE m.status = 'completed')::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id = p_profile_id)::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id IS NOT NULL AND m.winner_id != p_profile_id)::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND (m.winner_id IS NULL OR m.result = 'draw'))::INT
  FROM public.matches m
  WHERE m.requester_id = p_profile_id OR m.opponent_id = p_profile_id;
$$;

-- 2. ビューを関数ベースに修正（matches への直接参照をやめ、関数経由で集計）
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
  COALESCE(ms.games_played, 0)::INT AS games_played,
  COALESCE(ms.wins, 0)::INT AS wins,
  COALESCE(ms.losses, 0)::INT AS losses,
  COALESCE(ms.draws, 0)::INT AS draws
FROM public.profiles p
LEFT JOIN LATERAL get_profile_match_stats(p.id) AS ms(games_played, wins, losses, draws) ON true;

-- 関数の実行権限
GRANT EXECUTE ON FUNCTION public.get_profile_match_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_profile_match_stats(uuid) TO authenticated;
