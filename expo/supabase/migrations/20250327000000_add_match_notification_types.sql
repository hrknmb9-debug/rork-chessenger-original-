-- notifications INSERT ポリシーに match_accepted / match_declined タイプを追加
-- マッチ承諾・辞退時の通知が RLS でブロックされないようにする

DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    type IN (
      'new_message',
      'event_deadline_passed',
      'post_like',
      'post_reply',
      'post_comment',
      'event_join',
      'event_full',
      'match_accepted',
      'match_declined',
      'match_request'
    )
  );
