-- タイムライン表示のため、認証ユーザーが posts / events / event_participants を読み取れるようにする
-- （作成者本人が投稿直後に一覧で見えるよう、SELECT を許可）

-- posts: 認証済みユーザーは全投稿を SELECT 可能
DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;
CREATE POLICY "posts_select_authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

-- events: 認証済みユーザーは全イベントを SELECT 可能
DROP POLICY IF EXISTS "events_select_authenticated" ON public.events;
CREATE POLICY "events_select_authenticated"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

-- event_participants: 認証済みユーザーは全参加データを SELECT 可能
DROP POLICY IF EXISTS "event_participants_select_authenticated" ON public.event_participants;
CREATE POLICY "event_participants_select_authenticated"
  ON public.event_participants FOR SELECT
  TO authenticated
  USING (true);
