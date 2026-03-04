-- =============================================================================
-- multiple_permissive_policies 対応: 重複ポリシーを削除して1 role/action あたり1つに
-- =============================================================================
-- Dashboard → SQL Editor で実行してください。
-- 同じ role+action に複数ある permissive ポリシーのうち、冗長なものを削除します。
-- =============================================================================

-- events: events_select_anon と "events: 全員が読める" が重複 → events_select_anon を削除
DROP POLICY IF EXISTS "events_select_anon" ON public.events;

-- event_participants: event_participants_select_anon と他が重複 → event_participants_select_anon を削除
DROP POLICY IF EXISTS "event_participants_select_anon" ON public.event_participants;

-- posts: posts_select_anon と "posts: 全員が読める" が重複 → posts_select_anon を削除
DROP POLICY IF EXISTS "posts_select_anon" ON public.posts;

-- messages: "messages read", "messages update" は "messages: room参加者が読める", "messages: 受信者が既読にできる" と重複する場合があります。
-- マイグレーション 20250311000000 で "messages: 受信者が既読にできる" を修正済み。
-- messages read/update の削除は、既存の messages: 系ポリシーと役割を確認してから手動で検討してください。
