-- =============================================================================
-- multiple_permissive_policies 対応（明示的ポリシー名指定版）
-- =============================================================================
-- Dashboard → SQL Editor で実行してください。
-- Linter で指摘されたポリシー名を明示的に指定し、FOR ALL を操作別に分割します。
-- cmd 条件に依存しないため、確実に処理されます。
-- =============================================================================

DROP POLICY IF EXISTS "messages read" ON public.messages;
DROP POLICY IF EXISTS "messages update" ON public.messages;

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  roles_str TEXT;
  cmd_char TEXT;
  pol_rec RECORD;
  pol_name TEXT;
BEGIN
  FOR pol_rec IN
    SELECT unnest(ARRAY[
      'blocks: 本人のみ読める','blocks: 本人のみ削除できる',
      'comments: 全員が読める','comments: 本人のみ削除できる',
      'event_participants: 全員が読める','event_participants: 本人のみ離脱できる',
      'match_result_reports: 当事者が読める','match_result_reports: 本人のみ更新できる',
      'matches: 当事者のみ読める','matches: 当事者のみ更新できる',
      'messages: room参加者が読める','messages: 受信者が既読にできる',
      'notifications: 本人のみ読める','notifications: 本人のみ更新できる',
      'post_likes: 全員が読める','post_likes: 本人のみ削除できる',
      'posts: 全員が読める','posts: 本人のみ削除できる'
    ]) AS pname
  LOOP
    pol_name := pol_rec.pname;
    SELECT schemaname, tablename, roles, qual, with_check INTO r
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = pol_name LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF pol_name LIKE '%読める%' THEN
      cmd_char := 'r';
    ELSIF pol_name LIKE '%削除できる%' OR pol_name LIKE '%離脱できる%' THEN
      cmd_char := 'd';
    ELSIF pol_name LIKE '%更新できる%' OR pol_name LIKE '%既読にできる%' THEN
      cmd_char := 'w';
    ELSE
      CONTINUE;
    END IF;

    new_qual := COALESCE(r.qual::text, 'true');
    new_with_check := COALESCE(r.with_check::text, 'true');
    roles_str := CASE WHEN r.roles IS NULL OR array_length(r.roles, 1) IS NULL THEN 'public' ELSE array_to_string(r.roles, ', ') END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol_name, r.schemaname, r.tablename);

    IF cmd_char = 'r' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)', pol_name, r.schemaname, r.tablename, roles_str, new_qual);
    ELSIF cmd_char = 'w' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)', pol_name, r.schemaname, r.tablename, roles_str, new_qual, new_with_check);
    ELSIF cmd_char = 'd' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)', pol_name, r.schemaname, r.tablename, roles_str, new_qual);
    END IF;

    RAISE NOTICE 'Fixed: %', pol_name;
  END LOOP;
END $$;
