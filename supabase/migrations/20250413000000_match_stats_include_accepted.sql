-- games_played を accepted + completed でカウント（対局結果報告なしでもマッチ数が表示される）
-- wins/losses/draws は completed のみ（結果報告がある場合のみ）
CREATE OR REPLACE FUNCTION public.get_profile_match_stats(p_profile_id uuid)
RETURNS TABLE(games_played int, wins int, losses int, draws int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE m.status IN ('accepted', 'completed'))::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id = p_profile_id)::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND m.winner_id IS NOT NULL AND m.winner_id != p_profile_id)::INT,
    COUNT(*) FILTER (WHERE m.status = 'completed' AND (m.winner_id IS NULL OR m.result = 'draw'))::INT
  FROM public.matches m
  WHERE m.requester_id = p_profile_id OR m.opponent_id = p_profile_id;
$$;
