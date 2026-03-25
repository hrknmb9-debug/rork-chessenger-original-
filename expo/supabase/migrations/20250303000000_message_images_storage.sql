-- message-images バケット作成 + RLS
-- バケットが無いとアップロードできないため、マイグレーションで自動作成する。

INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', true)
ON CONFLICT (id) DO UPDATE SET public = true, name = EXCLUDED.name;

-- Authenticated users: INSERT (upload) only into their own folder: userId/roomId/filename
-- Path format: ${userId}/${roomId}/${Date.now()}.${fileExt}
DROP POLICY IF EXISTS "message_images_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "message_images_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "message_images_public_select" ON storage.objects;

CREATE POLICY "message_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-images'
  AND (storage.foldername(name))[1] = (SELECT auth.jwt()->>'sub')
);

-- Authenticated users: SELECT (read) so sent/received images display in chat
CREATE POLICY "message_images_authenticated_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'message-images');

-- Public read so getPublicUrl() works for unauthenticated or cross-user display
CREATE POLICY "message_images_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'message-images');
