-- =============================================================================
-- multiple_permissive_policies 対応: FOR ALL ポリシーを操作別に分割
-- =============================================================================
-- Dashboard → SQL Editor で実行してください。
-- ポリシー名から意図された操作を推定し、FOR ALL を FOR SELECT/INSERT/UPDATE/DELETE に分割。
-- =============================================================================

-- messages: 冗長な "messages read", "messages update" を先に削除
-- "messages: room参加者が読める" が SELECT、"messages: 受信者が既読にできる" が UPDATE を担当
DROP POLICY IF EXISTS "messages read" ON public.messages;
DROP POLICY IF EXISTS "messages update" ON public.messages;

DO $$
DECLARE
  r RECORD;
  new_cmd TEXT;
  new_qual TEXT;
  new_with_check TEXT;
  roles_str TEXT;
  cmd_char "char";
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd::text = '*'  -- FOR ALL のポリシーのみ
      AND policyname NOT IN ('unlimited_access', 'fix', 'fix_access', 'root_access', 'temporary_free_access')
  LOOP
    -- ポリシー名から適切な操作を推定（日本語名ベース）
    IF r.policyname LIKE '%読める%' OR r.policyname LIKE '%read%' THEN
      cmd_char := 'r';  -- SELECT
    ELSIF r.policyname LIKE '%作成できる%' OR r.policyname LIKE '%追加できる%'
       OR r.policyname LIKE '%参加できる%' OR r.policyname LIKE '%送信できる%'
       OR r.policyname LIKE '%insert%' THEN
      cmd_char := 'a';  -- INSERT
    ELSIF r.policyname LIKE '%更新できる%' OR r.policyname LIKE '%既読にできる%'
       OR r.policyname LIKE '%update%' THEN
      cmd_char := 'w';  -- UPDATE
    ELSIF r.policyname LIKE '%削除できる%' OR r.policyname LIKE '%離脱できる%'
       OR r.policyname LIKE '%delete%' THEN
      cmd_char := 'd';  -- DELETE
    ELSE
      CONTINUE;  -- 推定不能はスキップ
    END IF;

    new_qual := COALESCE(r.qual::text, 'true');
    new_with_check := COALESCE(r.with_check::text, 'true');

    roles_str := CASE
      WHEN r.roles IS NULL OR array_length(r.roles, 1) IS NULL THEN 'public'
      ELSE array_to_string(r.roles, ', ')
    END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF cmd_char = 'r' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    ELSIF cmd_char = 'a' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_with_check
      );
    ELSIF cmd_char = 'w' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual, new_with_check
      );
    ELSIF cmd_char = 'd' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    END IF;

    RAISE NOTICE 'Fixed policy %.% - % (cmd=%)', r.schemaname, r.tablename, r.policyname, cmd_char;
  END LOOP;
END $$;
