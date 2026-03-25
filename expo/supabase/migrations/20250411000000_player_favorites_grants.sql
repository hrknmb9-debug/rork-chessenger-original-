-- player_favorites: authenticated に明示的に権限付与（403 回避）
GRANT SELECT, INSERT, DELETE ON public.player_favorites TO authenticated;
