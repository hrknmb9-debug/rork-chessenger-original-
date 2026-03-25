-- 未インデックスの外部キーにインデックスを追加
-- unindexed_foreign_keys WARN を解消しクエリパフォーマンスを改善

-- comments
CREATE INDEX IF NOT EXISTS ix_comments_parent_id   ON public.comments (parent_id);
CREATE INDEX IF NOT EXISTS ix_comments_post_id     ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS ix_comments_user_id     ON public.comments (user_id);

-- event_participants
CREATE INDEX IF NOT EXISTS ix_event_participants_user_id  ON public.event_participants (user_id);

-- events
CREATE INDEX IF NOT EXISTS ix_events_post_id  ON public.events (post_id);

-- matches
CREATE INDEX IF NOT EXISTS ix_matches_winner_id  ON public.matches (winner_id);

-- messages
CREATE INDEX IF NOT EXISTS ix_messages_sender_id  ON public.messages (sender_id);

-- player_favorites
CREATE INDEX IF NOT EXISTS ix_player_favorites_favorite_player_id
  ON public.player_favorites (favorite_player_id);

-- post_likes
CREATE INDEX IF NOT EXISTS ix_post_likes_user_id  ON public.post_likes (user_id);

-- posts
CREATE INDEX IF NOT EXISTS ix_posts_user_id  ON public.posts (user_id);
