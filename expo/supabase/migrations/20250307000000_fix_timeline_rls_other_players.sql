-- 致命的な閲覧不具合の修正: 他プレイヤーの投稿・イベントが表示されない問題
-- 既存の制限的ポリシーを削除し、認証済み/anon が全件 SELECT できるようにする

-- 1. posts: 既存の SELECT ポリシーを削除し、全ユーザー参照可能に
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts' AND cmd = 'SELECT')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "posts_select_authenticated"
  ON public.posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "posts_select_anon"
  ON public.posts FOR SELECT TO anon
  USING (true);

-- 2. events: 既存の SELECT ポリシーを削除し、全ユーザー参照可能に
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND cmd = 'SELECT')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.events', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "events_select_authenticated"
  ON public.events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "events_select_anon"
  ON public.events FOR SELECT TO anon
  USING (true);

-- 3. event_participants: 既存の SELECT ポリシーを削除し、全ユーザー参照可能に
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_participants' AND cmd = 'SELECT')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.event_participants', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "event_participants_select_authenticated"
  ON public.event_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "event_participants_select_anon"
  ON public.event_participants FOR SELECT TO anon
  USING (true);

-- 4. comments / post_likes: タイムライン表示に必要。他ユーザーのコメント・いいねも参照可能に
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comments' AND cmd = 'SELECT')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.comments', r.policyname);
    END LOOP;
    DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
    CREATE POLICY "comments_select_authenticated" ON public.comments FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "comments_select_anon" ON public.comments;
    CREATE POLICY "comments_select_anon" ON public.comments FOR SELECT TO anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'post_likes') THEN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'post_likes' AND cmd = 'SELECT')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_likes', r.policyname);
    END LOOP;
    DROP POLICY IF EXISTS "post_likes_select_authenticated" ON public.post_likes;
    CREATE POLICY "post_likes_select_authenticated" ON public.post_likes FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "post_likes_select_anon" ON public.post_likes;
    CREATE POLICY "post_likes_select_anon" ON public.post_likes FOR SELECT TO anon USING (true);
  END IF;
END $$;
