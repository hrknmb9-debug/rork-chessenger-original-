-- =============================================================================
-- message-images バケット作成と RLS ポリシー（手動実行用）
-- =============================================================================
-- Supabase に message-images バケットが存在しない場合、
-- Dashboard → SQL Editor でこのファイルの内容をそのまま実行してください。
-- 実行後: 認証済みユーザーがアップロード可能、全ユーザーが画像表示可能になります。
-- =============================================================================

-- 1. バケット作成（公開バケット = getPublicUrl() で表示するため）
-- 注: バケットが既に Dashboard で作成されている場合はこの INSERT をスキップし、2〜5 の RLS のみ実行してください。
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', true)
ON CONFLICT (id) DO UPDATE SET public = true, name = EXCLUDED.name;

-- 2. 既存ポリシーを削除（再実行時用）
DROP POLICY IF EXISTS "message_images_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "message_images_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "message_images_public_select" ON storage.objects;

-- 3. 認証済みユーザー: INSERT（アップロード）許可
-- パス形式: ${userId}/${roomId}/${timestamp}.${ext} の先頭が auth.uid() と一致すること
CREATE POLICY "message_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-images'
  AND (storage.foldername(name))[1] = ((select auth.jwt())->>'sub')
);

-- 4. 認証済みユーザー: SELECT（画像表示）許可
CREATE POLICY "message_images_authenticated_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'message-images');

-- 5. 公開読み取り（未認証・他ユーザーでも画像URLで表示可能）
CREATE POLICY "message_images_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'message-images');
