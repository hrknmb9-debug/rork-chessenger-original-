-- multiple_permissive_policies 対応: FOR ALL を操作別に分割し、1 role/action あたり1ポリシーに
-- ポリシー名から意図された操作を推定し、FOR ALL → FOR SELECT/INSERT/UPDATE/DELETE に変換

-- messages: 冗長な "messages read", "messages update" を削除
DROP POLICY IF EXISTS "messages read" ON public.messages;
DROP POLICY IF EXISTS "messages update" ON public.messages;

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  roles_str TEXT;
  cmd_char "char";
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname NOT IN ('unlimited_access', 'fix', 'fix_access', 'root_access', 'temporary_free_access')
      AND (
        policyname LIKE '%読める%' OR policyname LIKE '%read%'
        OR policyname LIKE '%作成できる%' OR policyname LIKE '%追加できる%' OR policyname LIKE '%参加できる%' OR policyname LIKE '%送信できる%' OR policyname LIKE '%insert%'
        OR policyname LIKE '%更新できる%' OR policyname LIKE '%既読にできる%' OR policyname LIKE '%update%'
        OR policyname LIKE '%削除できる%' OR policyname LIKE '%離脱できる%' OR policyname LIKE '%delete%'
      )
  LOOP
    IF r.policyname LIKE '%読める%' OR r.policyname LIKE '%read%' THEN
      cmd_char := 'r';
    ELSIF r.policyname LIKE '%作成できる%' OR r.policyname LIKE '%追加できる%'
       OR r.policyname LIKE '%参加できる%' OR r.policyname LIKE '%送信できる%' OR r.policyname LIKE '%insert%' THEN
      cmd_char := 'a';
    ELSIF r.policyname LIKE '%更新できる%' OR r.policyname LIKE '%既読にできる%' OR r.policyname LIKE '%update%' THEN
      cmd_char := 'w';
    ELSIF r.policyname LIKE '%削除できる%' OR r.policyname LIKE '%離脱できる%' OR r.policyname LIKE '%delete%' THEN
      cmd_char := 'd';
    ELSE
      CONTINUE;
    END IF;

    new_qual := COALESCE(r.qual::text, 'true');
    new_with_check := COALESCE(r.with_check::text, 'true');
    roles_str := CASE WHEN r.roles IS NULL OR array_length(r.roles, 1) IS NULL THEN 'public' ELSE array_to_string(r.roles, ', ') END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF cmd_char = 'r' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)', r.policyname, r.schemaname, r.tablename, roles_str, new_qual);
    ELSIF cmd_char = 'a' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, roles_str, new_with_check);
    ELSIF cmd_char = 'w' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, roles_str, new_qual, new_with_check);
    ELSIF cmd_char = 'd' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)', r.policyname, r.schemaname, r.tablename, roles_str, new_qual);
    END IF;
  END LOOP;
END $$;
