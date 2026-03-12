-- オンライン表示の診断用
-- Supabase SQL Editor で実行し、last_seen の状況を確認
-- 5分以内 = オンライン扱い、5分超 = オフライン扱い

-- 1. 直近の last_seen 更新状況（オンライン扱いになるユーザー）
SELECT id, name, last_seen, last_active,
  CASE
    WHEN last_seen IS NULL THEN 'オフライン (last_seen null)'
    WHEN last_seen > NOW() - INTERVAL '5 minutes' THEN 'オンライン (5分以内)'
    ELSE 'オフライン (5分超)'
  END AS online_status
FROM profiles
ORDER BY last_seen DESC NULLS LAST
LIMIT 20;

-- 2. last_seen が null のユーザー（未更新・オフライン扱い）
SELECT COUNT(*) AS null_last_seen_count FROM profiles WHERE last_seen IS NULL;

-- 3. last_active のみ値があり last_seen が null のユーザー（last_active は online 判定に使用しない）
SELECT id, name, last_seen, last_active FROM profiles
WHERE last_seen IS NULL AND last_active IS NOT NULL
LIMIT 10;
