-- messages RLS 修正: Supabase Dashboard の SQL Editor で実行
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages: room参加者が読める" ON public.messages;
CREATE POLICY "messages: room参加者が読める"
ON public.messages FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%'));

DROP POLICY IF EXISTS "messages: 参加者のみ送信できる" ON public.messages;
CREATE POLICY "messages: 参加者のみ送信できる"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND sender_id = (SELECT auth.uid())
  AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%')
);
