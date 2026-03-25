-- function_search_path_mutable 対応: set_updated_at の search_path を固定
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'set_updated_at') THEN
    EXECUTE format('ALTER FUNCTION public.set_updated_at() SET search_path = %L', '');
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL; -- 引数が異なる場合はスキップ
END $$;
