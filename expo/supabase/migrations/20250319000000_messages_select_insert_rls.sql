-- =============================================================================
-- messages 用の SELECT / INSERT RLS ポリシーを明示的に作成
-- =============================================================================
-- 20250312/013 の fix_multiple_permissive_policies は既存ポリシーのみ操作し、
-- 「messages: room参加者が読める」「messages の INSERT ポリシー」がマイグレーションで
-- 一度も作成されていないため、新規環境でメッセージの送受信ができない問題を解消する。
-- =============================================================================

-- messages の RLS を有効化（未設定の場合）
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- messages: room参加者が読める (SELECT)
-- room_id に auth.uid() が含まれる場合にのみ読める（LIKE で曖昧一致）
DROP POLICY IF EXISTS "messages: room参加者が読める" ON public.messages;
CREATE POLICY "messages: room参加者が読める"
ON public.messages FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%')
);

-- messages: 参加者のみ送信できる (INSERT)
-- sender_id = auth.uid() かつ room_id に auth.uid() が含まれる場合のみ INSERT 可能
DROP POLICY IF EXISTS "messages: 参加者のみ送信できる" ON public.messages;
CREATE POLICY "messages: 参加者のみ送信できる"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND sender_id = (SELECT auth.uid())
  AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%')
);
