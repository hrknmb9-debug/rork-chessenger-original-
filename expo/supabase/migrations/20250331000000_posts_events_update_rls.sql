-- タイムライン編集を反映させるため、posts と events に UPDATE ポリシーを追加
-- これがないと RLS により UPDATE が拒否され、編集が DB に保存されない

-- posts: 本人の投稿のみ更新可能
DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- events: 自分の投稿に紐づくイベントのみ更新可能
DROP POLICY IF EXISTS "events_update_own_post" ON public.events;
CREATE POLICY "events_update_own_post"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = (SELECT auth.uid()))
  );
