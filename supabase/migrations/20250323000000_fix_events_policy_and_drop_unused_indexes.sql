-- ============================================================
-- 1. events テーブルの重複 INSERT ポリシーを解消
--    authenticated ロールに対して INSERT ポリシーが2つあるため
--    古い方を削除して1つに統合する
-- ============================================================

-- 古いポリシーを削除（存在する場合のみ）
DROP POLICY IF EXISTS "events: ログイン済みが作成できる" ON public.events;

-- events_insert_for_own_post ポリシーが存在しない場合は作成
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'events'
      AND policyname = 'events_insert_for_own_post'
  ) THEN
    CREATE POLICY events_insert_for_own_post ON public.events
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.posts
          WHERE posts.id = post_id
            AND posts.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- ============================================================
-- 2. 未使用インデックスの削除（INFO レベル / パフォーマンス改善）
--    ※ アプリが成長しクエリパターンが増えた場合は再作成を検討
-- ============================================================

DROP INDEX IF EXISTS public.ix_comments_parent_id;
DROP INDEX IF EXISTS public.ix_comments_post_id;
DROP INDEX IF EXISTS public.ix_comments_user_id;
DROP INDEX IF EXISTS public.ix_event_participants_user_id;
DROP INDEX IF EXISTS public.ix_events_post_id;
DROP INDEX IF EXISTS public.ix_matches_winner_id;
DROP INDEX IF EXISTS public.ix_messages_sender_id;
DROP INDEX IF EXISTS public.ix_post_likes_user_id;
DROP INDEX IF EXISTS public.profiles_location_idx;
DROP INDEX IF EXISTS public.profiles_is_online_idx;
DROP INDEX IF EXISTS public.posts_user_id_idx;
