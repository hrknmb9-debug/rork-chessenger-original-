-- マッチ数が 0 と表示されるプレイヤーの診断用
-- Supabase SQL Editor で実行（service_role 相当で実行されるため RLS をバイパス）
-- プレイヤーIDを差し替えて実行

-- 【先に実行】DB 全体の状況確認
-- A. matches テーブル（status 別）
SELECT status, COUNT(*) AS cnt FROM matches GROUP BY status ORDER BY status;

-- B. games_played は status='completed' のみカウント（accepted は含まない。対局結果報告後に増える）

-- C. 全プレイヤーのビュー集計結果（0 以外がいれば関数は動いている）
SELECT id, name, games_played, wins, losses, draws
FROM profiles_with_match_stats
WHERE games_played > 0
ORDER BY games_played DESC
LIMIT 10;

-- 1. 対象プレイヤーの matches 一覧（status 別）
SELECT id, requester_id, opponent_id, status, winner_id, result, created_at
FROM matches
WHERE requester_id = 'e7669eee-0b9b-4158-a1e3-89f44aa032d6'::uuid
   OR opponent_id = 'e7669eee-0b9b-4158-a1e3-89f44aa032d6'::uuid
ORDER BY created_at DESC;

-- 2. 関数の直接呼び出し結果
SELECT * FROM get_profile_match_stats('e7669eee-0b9b-4158-a1e3-89f44aa032d6'::uuid);

-- 3. ビューの結果
SELECT id, name, games_played, wins, losses, draws
FROM profiles_with_match_stats
WHERE id = 'e7669eee-0b9b-4158-a1e3-89f44aa032d6';
