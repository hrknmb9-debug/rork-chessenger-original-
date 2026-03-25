-- profiles_with_match_stats の SELECT 権限を明示的に付与
-- CREATE OR REPLACE VIEW 後も権限は継承されるが、確実にするため再付与
GRANT SELECT ON public.profiles_with_match_stats TO anon;
GRANT SELECT ON public.profiles_with_match_stats TO authenticated;
