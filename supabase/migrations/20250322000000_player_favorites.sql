-- player_favorites: プレイヤーお気に入り
CREATE TABLE IF NOT EXISTS public.player_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, favorite_player_id),
  CONSTRAINT no_self_favorite CHECK (user_id != favorite_player_id)
);

ALTER TABLE public.player_favorites ENABLE ROW LEVEL SECURITY;

-- 自分がお気に入り登録・解除できる
CREATE POLICY "player_favorites_insert_own"
  ON public.player_favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "player_favorites_delete_own"
  ON public.player_favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 自分のお気に入り一覧を読める
CREATE POLICY "player_favorites_select_own"
  ON public.player_favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
