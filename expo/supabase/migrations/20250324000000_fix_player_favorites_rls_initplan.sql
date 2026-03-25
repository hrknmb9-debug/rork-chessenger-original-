-- player_favorites の RLS ポリシーを最適化
-- auth.uid() -> (SELECT auth.uid()) に変更し、各行ごとの再評価を防ぐ

DROP POLICY IF EXISTS "player_favorites_insert_own" ON public.player_favorites;
DROP POLICY IF EXISTS "player_favorites_delete_own" ON public.player_favorites;
DROP POLICY IF EXISTS "player_favorites_select_own" ON public.player_favorites;

CREATE POLICY "player_favorites_insert_own"
  ON public.player_favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "player_favorites_delete_own"
  ON public.player_favorites FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "player_favorites_select_own"
  ON public.player_favorites FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
