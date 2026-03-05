-- notifications INSERT: WITH CHECK (true) を廃止し、許可する type をホワイトリストで制限
-- lint 0024_permissive_rls_policy 対応
-- クライアントから挿入される通知タイプのみ許可（他ユーザー宛・自己宛いずれもアプリの業務ロジックに限定）

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
      'event_join',
      'event_full'
    )
  );
