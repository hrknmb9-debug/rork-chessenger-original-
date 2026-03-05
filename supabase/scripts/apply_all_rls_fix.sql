-- =============================================================================
-- 全 RLS 修正: Supabase Dashboard の SQL Editor で実行
-- =============================================================================
-- メッセージ・投稿・イベント・いいね・コメントの 403 / RLS violation を一括解消
-- =============================================================================

-- 1. messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages: room参加者が読める" ON public.messages;
CREATE POLICY "messages: room参加者が読める"
ON public.messages FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%'));
DROP POLICY IF EXISTS "messages: 参加者のみ送信できる" ON public.messages;
CREATE POLICY "messages: 参加者のみ送信できる"
ON public.messages FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND sender_id = (SELECT auth.uid()) AND (room_id LIKE '%' || ((SELECT auth.uid())::text) || '%'));

-- 2. posts / events / post_likes / comments
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_insert_for_own_post" ON public.events;
CREATE POLICY "events_insert_for_own_post" ON public.events FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = (SELECT auth.uid())));

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_likes_insert_own" ON public.post_likes;
CREATE POLICY "post_likes_insert_own" ON public.post_likes FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));
