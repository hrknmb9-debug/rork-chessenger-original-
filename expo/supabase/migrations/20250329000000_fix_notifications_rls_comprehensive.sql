-- 通知 RLS 完全修正マイグレーション（冪等・安全に再適用可能）
--
-- 【根本原因】
-- migration 20250318: notifications INSERT ホワイトリストから 'post_comment' が除外
-- migration 20250326: post_comment を追加したが未適用の可能性がある
-- → post_like は 20250318 から存在するため「いいね通知は正常・コメント通知は来ない」という
--    ユーザー報告と完全に一致する
--
-- 【対策】
-- このマイグレーションで全タイプを一括で設定し直す（DROP → CREATE で確実に上書き）

-- ============================================================
-- 1. RLS を明示的に有効化
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. INSERT ポリシー: 全タイプを包括的に許可（冪等）
-- ============================================================
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    type IN (
      'new_message',
      'event_deadline_passed',
      'post_like',
      'post_reply',
      'post_comment',      -- 20250318 で除外されたため通知が来なかった根本原因
      'event_join',
      'event_full',
      'match_accepted',
      'match_declined',
      'match_request'
    )
  );

-- ============================================================
-- 3. SELECT ポリシー: 自分宛の通知のみ読み取り可（冪等）
-- ============================================================
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- 4. UPDATE ポリシー: 自分の通知を既読にする（冪等）
-- ============================================================
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================
-- 5. Realtime パブリケーション登録（冪等: 既登録でも安全）
-- ============================================================
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
