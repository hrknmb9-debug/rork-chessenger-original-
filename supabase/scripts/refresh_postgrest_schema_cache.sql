-- PostgREST のスキーマキャッシュを更新する
-- profiles_with_match_stats 等のビュー変更後、Supabase ダッシュボードの SQL Editor で実行
-- 参考: https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema
NOTIFY pgrst, 'reload schema';

-- 動作確認用（上記実行後、ビューが正しく返るか確認）
-- SELECT id, name, games_played, wins, losses, draws FROM profiles_with_match_stats LIMIT 5;
