-- 重複 RLS ポリシー削除（Multiple Permissive Policies 警告解消）
--
-- 原因: 20250329000000 で英語名ポリシーを追加したが、
--       ダッシュボードで先に日本語名ポリシーが作成されており重複していた。
--
-- 対象テーブル: public.notifications
--   SELECT: "notifications: 本人のみ読める"  ← 削除（notifications_select_own を残す）
--   UPDATE: "notifications: 本人のみ更新できる" ← 削除（notifications_update_own を残す）

DROP POLICY IF EXISTS "notifications: 本人のみ読める" ON public.notifications;
DROP POLICY IF EXISTS "notifications: 本人のみ更新できる" ON public.notifications;

-- 念のため残すべき英語名ポリシーが存在することを確認する（存在しない場合は再作成）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_select_own'
  ) THEN
    CREATE POLICY "notifications_select_own"
      ON public.notifications FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_update_own'
  ) THEN
    CREATE POLICY "notifications_update_own"
      ON public.notifications FOR UPDATE
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;
END $$;
