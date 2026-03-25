-- 既存の completed マッチから profiles の games_played, wins, losses, draws を再計算して同期
-- トリガー導入前に完了した対局で他ユーザーの profiles が更新されていなかった分を補正

WITH match_stats AS (
  SELECT
    p.id,
    COALESCE(SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END), 0)::INT AS games_played,
    COALESCE(SUM(CASE WHEN m.status = 'completed' AND m.winner_id = p.id THEN 1 ELSE 0 END), 0)::INT AS wins,
    COALESCE(SUM(CASE WHEN m.status = 'completed' AND m.winner_id IS NOT NULL AND m.winner_id != p.id THEN 1 ELSE 0 END), 0)::INT AS losses,
    COALESCE(SUM(CASE WHEN m.status = 'completed' AND (m.winner_id IS NULL OR m.result = 'draw') THEN 1 ELSE 0 END), 0)::INT AS draws
  FROM public.profiles p
  LEFT JOIN public.matches m ON (m.requester_id = p.id OR m.opponent_id = p.id)
  GROUP BY p.id
)
UPDATE public.profiles pr
SET
  games_played = ms.games_played,
  wins = ms.wins,
  losses = ms.losses,
  draws = ms.draws
FROM match_stats ms
WHERE pr.id = ms.id
  AND (pr.games_played IS DISTINCT FROM ms.games_played
    OR pr.wins IS DISTINCT FROM ms.wins
    OR pr.losses IS DISTINCT FROM ms.losses
    OR pr.draws IS DISTINCT FROM ms.draws);
