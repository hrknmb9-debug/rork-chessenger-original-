-- 複数プロフィールのマッチ集計を一括取得（RPC でビューをバイパス、SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.get_profile_match_stats_batch(p_profile_ids uuid[])
RETURNS TABLE(profile_id uuid, games_played int, wins int, losses int, draws int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pid AS profile_id,
    COALESCE(ms.games_played, 0)::int,
    COALESCE(ms.wins, 0)::int,
    COALESCE(ms.losses, 0)::int,
    COALESCE(ms.draws, 0)::int
  FROM unnest(p_profile_ids) AS pid
  LEFT JOIN LATERAL get_profile_match_stats(pid) AS ms(games_played, wins, losses, draws) ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_match_stats_batch(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_profile_match_stats_batch(uuid[]) TO authenticated;
