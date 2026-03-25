-- rls_policy_always_true 対応: UPDATE ポリシーの WITH CHECK (true) を USING と同じ条件に修正
-- https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

-- match_result_reports: reporter 本人のみ更新可能。WITH CHECK でも reporter_id 一致を要求
DROP POLICY IF EXISTS "match_result_reports: 本人のみ更新できる" ON public.match_result_reports;
CREATE POLICY "match_result_reports: 本人のみ更新できる"
ON public.match_result_reports FOR UPDATE
TO authenticated
USING ((select auth.uid()) = reporter_id)
WITH CHECK ((select auth.uid()) = reporter_id);

-- matches: 当事者のみ更新可能。WITH CHECK でも requester/opponent の一致を要求
DROP POLICY IF EXISTS "matches: 当事者のみ更新できる" ON public.matches;
CREATE POLICY "matches: 当事者のみ更新できる"
ON public.matches FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = requester_id OR (select auth.uid()) = opponent_id
)
WITH CHECK (
  (select auth.uid()) = requester_id OR (select auth.uid()) = opponent_id
);

-- messages: 受信者のみ is_read 更新可能。WITH CHECK でも同条件
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

-- notifications: 本人のみ更新可能。WITH CHECK でも user_id 一致を要求
DROP POLICY IF EXISTS "notifications: 本人のみ更新できる" ON public.notifications;
CREATE POLICY "notifications: 本人のみ更新できる"
ON public.notifications FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);
