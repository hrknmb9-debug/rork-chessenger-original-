-- event_participants: 認証済みユーザーが自分自身を参加者として追加可能
-- notifications: 認証済みユーザーが他ユーザー宛の通知を作成可能（イベント参加通知等）

-- event_participants INSERT
DROP POLICY IF EXISTS "event_participants_insert_own" ON public.event_participants;
CREATE POLICY "event_participants_insert_own"
  ON public.event_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- event_participants DELETE（本人のみ離脱）
DROP POLICY IF EXISTS "event_participants_delete_own" ON public.event_participants;
DROP POLICY IF EXISTS "event_participants: 本人のみ離脱できる" ON public.event_participants;
CREATE POLICY "event_participants_delete_own"
  ON public.event_participants FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- notifications INSERT（認証済みユーザーが他ユーザーに通知を送る）
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
