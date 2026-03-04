-- =============================================================================
-- rls_policy_always_true 対応: 過度に寛大な RLS ポリシーを削除・修正
-- =============================================================================
-- Dashboard → SQL Editor で実行してください。
-- =============================================================================

-- 1. events: ログイン済みが作成できる - WITH CHECK (true) を auth チェックに修正
DROP POLICY IF EXISTS "events: ログイン済みが作成できる" ON public.events;
CREATE POLICY "events: ログイン済みが作成できる"
ON public.events FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- 2. unlimited_access 等の全許可ポリシーを削除（開発用として追加された可能性）
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('unlimited_access', 'fix', 'fix_access', 'root_access', 'temporary_free_access')
      AND cmd != 'r'  -- SELECT の USING(true) は意図的であることが多いため除外
      AND (
        (qual IS NULL OR qual::text = 'true')
        AND (with_check IS NULL OR with_check::text = 'true')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped policy %.% - %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;

-- 3. messages: 受信者が既読にできる - USING(true) は要修正
-- room 参加者かつ送信者以外のみ is_read を更新可、など条件を追加してください。
-- スキーマに合わせて手動で DROP/CREATE するか、アプリ側で制御するかを検討してください。
