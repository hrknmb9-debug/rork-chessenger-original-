-- =============================================================================
-- タイムライン RLS 修正: Supabase Dashboard の SQL Editor で実行
-- =============================================================================
-- 投稿・イベント・いいね・コメントの 403 / RLS violation を解消します。
-- このスクリプトをコピーして Supabase → SQL Editor で実行してください。
-- =============================================================================

-- posts: 認証済みユーザーは自分名義で投稿可能
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
ON public.posts FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

-- events: 自分の投稿に紐づくイベントのみ作成可能
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_insert_for_own_post" ON public.events;
CREATE POLICY "events_insert_for_own_post"
ON public.events FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = (SELECT auth.uid()))
);

-- post_likes: 認証済みユーザーは自分名義でいいね可能
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_likes_insert_own" ON public.post_likes;
CREATE POLICY "post_likes_insert_own"
ON public.post_likes FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

-- comments: 認証済みユーザーは自分名義でコメント可能
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own"
ON public.comments FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));
