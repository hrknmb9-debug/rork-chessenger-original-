-- =============================================================================
-- auth_rls_initplan 一括修正スクリプト（手動実行用）
-- =============================================================================
-- Dashboard → SQL Editor で実行してください。
-- auth.uid() / auth.jwt() / auth.role() を (select auth.X()) に置換し、
-- 行ごとの再評価を防いでクエリパフォーマンスを改善します。
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  roles_str TEXT;
  cmd_str TEXT;
  has_qual BOOLEAN;
  has_with_check BOOLEAN;
BEGIN
  FOR r IN
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual IS NOT NULL OR with_check IS NOT NULL)
      AND (
        (qual::text ~ 'auth\.(uid|jwt|role)\(\)' AND qual::text !~ '\(select auth\.(uid|jwt|role)\(\)\)')
        OR
        (with_check::text ~ 'auth\.(uid|jwt|role)\(\)' AND with_check::text !~ '\(select auth\.(uid|jwt|role)\(\)\)')
      )
  LOOP
    new_qual := COALESCE(r.qual::text, '');
    new_with_check := COALESCE(r.with_check::text, '');

    -- 既に (select auth.X()) の場合はプレースホルダに退避してから置換（二重ラップ防止）
    new_qual := replace(replace(replace(new_qual, '(select auth.uid())', '<<<AUTH_UID>>>'), '(select auth.jwt())', '<<<AUTH_JWT>>>'), '(select auth.role())', '<<<AUTH_ROLE>>>');
    new_with_check := replace(replace(replace(new_with_check, '(select auth.uid())', '<<<AUTH_UID>>>'), '(select auth.jwt())', '<<<AUTH_JWT>>>'), '(select auth.role())', '<<<AUTH_ROLE>>>');

    new_qual := replace(replace(replace(new_qual, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())'), 'auth.role()', '(select auth.role())');
    new_with_check := replace(replace(replace(new_with_check, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())'), 'auth.role()', '(select auth.role())');

    new_qual := replace(replace(replace(new_qual, '<<<AUTH_UID>>>', '(select auth.uid())'), '<<<AUTH_JWT>>>', '(select auth.jwt())'), '<<<AUTH_ROLE>>>', '(select auth.role())');
    new_with_check := replace(replace(replace(new_with_check, '<<<AUTH_UID>>>', '(select auth.uid())'), '<<<AUTH_JWT>>>', '(select auth.jwt())'), '<<<AUTH_ROLE>>>', '(select auth.role())');

    has_qual := trim(new_qual) <> '';
    has_with_check := trim(new_with_check) <> '';

    -- TO 句: 単一ロールは "role", 複数は "(r1, r2)"
    roles_str := CASE
      WHEN r.roles IS NULL OR array_length(r.roles, 1) IS NULL THEN 'public'
      WHEN array_length(r.roles, 1) = 1 THEN r.roles[1]::text
      ELSE '(' || array_to_string(r.roles, ', ') || ')'
    END;
    cmd_str := CASE r.cmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF cmd_str = 'INSERT' AND has_with_check THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_with_check
      );
    ELSIF cmd_str = 'UPDATE' AND has_qual AND has_with_check THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual, new_with_check
      );
    ELSIF cmd_str = 'UPDATE' AND has_with_check THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (true) WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_with_check
      );
    ELSIF cmd_str = 'UPDATE' AND has_qual THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    ELSIF cmd_str = 'DELETE' AND has_qual THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    ELSIF cmd_str = 'SELECT' AND has_qual THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    ELSIF cmd_str = 'ALL' AND has_qual AND has_with_check THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual, new_with_check
      );
    ELSIF cmd_str = 'ALL' AND has_qual THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO %s USING (%s)',
        r.policyname, r.schemaname, r.tablename, roles_str, new_qual
      );
    END IF;

    RAISE NOTICE 'Fixed policy %.% - %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;
