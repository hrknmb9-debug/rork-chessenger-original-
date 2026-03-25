-- 未認証・セッション復元前でもタイムラインが表示されるように anon に SELECT を許可
-- （公開タイムラインとして events / posts / event_participants を閲覧可能にする）

DROP POLICY IF EXISTS "events_select_anon" ON public.events;
CREATE POLICY "events_select_anon"
  ON public.events FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "posts_select_anon" ON public.posts;
CREATE POLICY "posts_select_anon"
  ON public.posts FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "event_participants_select_anon" ON public.event_participants;
CREATE POLICY "event_participants_select_anon"
  ON public.event_participants FOR SELECT
  TO anon
  USING (true);
