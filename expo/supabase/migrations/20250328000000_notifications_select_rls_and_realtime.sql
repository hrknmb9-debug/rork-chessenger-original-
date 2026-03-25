-- notifications: SELECT ポリシー追加 + Realtime 有効化
-- 【根本原因】SELECT ポリシーが存在しないため:
--   1. loadSupabaseData の SELECT クエリが 0 件返却 → 通知が表示されない
--   2. Realtime の filter 評価が SELECT 権限に依存 → INSERT イベントが届かない
-- 【対策】
--   - notifications_select_own: 自分宛の通知のみ読み取り可
--   - notifications_update_own: is_read を自分で更新可能（既読機能用）
--   - supabase_realtime パブリケーションに追加 → Realtime INSERT 通知が届く

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Realtime 有効化（notifications への INSERT を購読側に配信する）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
