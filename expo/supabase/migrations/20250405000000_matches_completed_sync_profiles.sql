-- 対局完了時に両プレイヤーの profiles (games_played, wins, losses, draws, rating) を更新するトリガー
-- RLS によりクライアントから他ユーザーの profiles を UPDATE できないため、DB トリガーで確実に反映する

CREATE OR REPLACE FUNCTION public.sync_profiles_on_match_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req_rating INT;
  opp_rating INT;
  req_gp INT;
  req_w INT;
  req_l INT;
  req_d INT;
  opp_gp INT;
  opp_w INT;
  opp_l INT;
  opp_d INT;
  winner_new INT;
  loser_new INT;
  exp_winner FLOAT;
  exp_loser FLOAT;
  k_factor INT := 16;
  is_draw BOOLEAN;
  reporter_won BOOLEAN;
BEGIN
  -- status が completed に変わったときのみ実行
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW;  -- 既に completed の場合はスキップ（二重更新防止）
  END IF;

  -- 両者の現在のプロフィールを取得
  SELECT COALESCE(rating, 1200)::INT, COALESCE(games_played, 0), COALESCE(wins, 0), COALESCE(losses, 0), COALESCE(draws, 0)
  INTO req_rating, req_gp, req_w, req_l, req_d
  FROM public.profiles WHERE id = NEW.requester_id;

  SELECT COALESCE(rating, 1200)::INT, COALESCE(games_played, 0), COALESCE(wins, 0), COALESCE(losses, 0), COALESCE(draws, 0)
  INTO opp_rating, opp_gp, opp_w, opp_l, opp_d
  FROM public.profiles WHERE id = NEW.opponent_id;

  -- NULL の場合はデフォルト
  req_rating := COALESCE(req_rating, 1200);
  opp_rating := COALESCE(opp_rating, 1200);
  req_gp := COALESCE(req_gp, 0);
  req_w := COALESCE(req_w, 0);
  req_l := COALESCE(req_l, 0);
  req_d := COALESCE(req_d, 0);
  opp_gp := COALESCE(opp_gp, 0);
  opp_w := COALESCE(opp_w, 0);
  opp_l := COALESCE(opp_l, 0);
  opp_d := COALESCE(opp_d, 0);

  is_draw := (NEW.winner_id IS NULL OR NEW.result = 'draw');

  -- Elo 計算（標準 K=16）
  IF is_draw THEN
    exp_winner := 1.0 / (1.0 + POWER(10.0, (opp_rating - req_rating) / 400.0));
    exp_loser := 1.0 / (1.0 + POWER(10.0, (req_rating - opp_rating) / 400.0));
    winner_new := ROUND(req_rating + k_factor * (0.5 - exp_winner))::INT;
    loser_new := ROUND(opp_rating + k_factor * (0.5 - exp_loser))::INT;
    -- 引き分けでは両者とも「winner_new/loser_new」の扱い（同じ計算を両方に適用）
    UPDATE public.profiles SET
      rating = GREATEST(0, winner_new),
      games_played = req_gp + 1,
      wins = req_w,
      losses = req_l,
      draws = req_d + 1
    WHERE id = NEW.requester_id;
    UPDATE public.profiles SET
      rating = GREATEST(0, loser_new),
      games_played = opp_gp + 1,
      wins = opp_w,
      losses = opp_l,
      draws = opp_d + 1
    WHERE id = NEW.opponent_id;
  ELSE
    -- 勝敗あり: winner_id が勝者
    reporter_won := (NEW.winner_id = NEW.requester_id);
    IF reporter_won THEN
      exp_winner := 1.0 / (1.0 + POWER(10.0, (opp_rating - req_rating) / 400.0));
      exp_loser := 1.0 / (1.0 + POWER(10.0, (req_rating - opp_rating) / 400.0));
      winner_new := ROUND(req_rating + k_factor * (1.0 - exp_winner))::INT;
      loser_new := ROUND(opp_rating + k_factor * (0.0 - exp_loser))::INT;
      UPDATE public.profiles SET
        rating = GREATEST(0, winner_new),
        games_played = req_gp + 1,
        wins = req_w + 1,
        losses = req_l,
        draws = req_d
      WHERE id = NEW.requester_id;
      UPDATE public.profiles SET
        rating = GREATEST(0, loser_new),
        games_played = opp_gp + 1,
        wins = opp_w,
        losses = opp_l + 1,
        draws = opp_d
      WHERE id = NEW.opponent_id;
    ELSE
      exp_winner := 1.0 / (1.0 + POWER(10.0, (req_rating - opp_rating) / 400.0));
      exp_loser := 1.0 / (1.0 + POWER(10.0, (opp_rating - req_rating) / 400.0));
      winner_new := ROUND(opp_rating + k_factor * (1.0 - exp_winner))::INT;
      loser_new := ROUND(req_rating + k_factor * (0.0 - exp_loser))::INT;
      UPDATE public.profiles SET
        rating = GREATEST(0, loser_new),
        games_played = req_gp + 1,
        wins = req_w,
        losses = req_l + 1,
        draws = req_d
      WHERE id = NEW.requester_id;
      UPDATE public.profiles SET
        rating = GREATEST(0, winner_new),
        games_played = opp_gp + 1,
        wins = opp_w + 1,
        losses = opp_l,
        draws = opp_d
      WHERE id = NEW.opponent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_match_completed_sync_profiles ON public.matches;
CREATE TRIGGER on_match_completed_sync_profiles
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profiles_on_match_completed();
