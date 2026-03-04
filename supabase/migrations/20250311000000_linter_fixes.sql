-- Linter 対応: unindexed_foreign_keys, messages 受信者既読ポリシー, 重複ポリシー削除
-- https://supabase.com/docs/guides/database/database-linter

-- =============================================================================
-- 1. unindexed_foreign_keys: FK カラムにインデックス追加
-- =============================================================================
CREATE INDEX IF NOT EXISTS ix_blocks_blocked_id ON public.blocks(blocked_id);
CREATE INDEX IF NOT EXISTS ix_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS ix_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS ix_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS ix_event_participants_user_id ON public.event_participants(user_id);
CREATE INDEX IF NOT EXISTS ix_events_post_id ON public.events(post_id);
CREATE INDEX IF NOT EXISTS ix_match_ratings_match_id ON public.match_ratings(match_id);
CREATE INDEX IF NOT EXISTS ix_match_ratings_rater_id ON public.match_ratings(rater_id);
CREATE INDEX IF NOT EXISTS ix_match_result_reports_match_id ON public.match_result_reports(match_id);
CREATE INDEX IF NOT EXISTS ix_match_result_reports_opponent_id ON public.match_result_reports(opponent_id);
CREATE INDEX IF NOT EXISTS ix_match_result_reports_reporter_id ON public.match_result_reports(reporter_id);
CREATE INDEX IF NOT EXISTS ix_matches_winner_id ON public.matches(winner_id);
CREATE INDEX IF NOT EXISTS ix_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS ix_post_likes_user_id ON public.post_likes(user_id);
CREATE INDEX IF NOT EXISTS ix_reports_reported_id ON public.reports(reported_id);

-- =============================================================================
-- 2. messages: 受信者が既読にできる - USING(true) を修正
-- room_id に含まれるユーザーかつ送信者以外のみ is_read を更新可能
-- =============================================================================
DROP POLICY IF EXISTS "messages: 受信者が既読にできる" ON public.messages;
CREATE POLICY "messages: 受信者が既読にできる"
ON public.messages FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND sender_id IS DISTINCT FROM (select auth.uid())
  AND position(((select auth.uid())::text) in room_id) > 0
)
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND sender_id IS DISTINCT FROM (select auth.uid())
  AND position(((select auth.uid())::text) in room_id) > 0
);
