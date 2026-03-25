-- events テーブルのカラム一覧を確認（Supabase SQL Editor で実行）
-- deadline_at / closed_at の有無を確認するため
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'events'
ORDER BY ordinal_position;
