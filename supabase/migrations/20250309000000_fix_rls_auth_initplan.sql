-- RLS auth_rls_initplan 修正: auth.jwt() を (select auth.jwt()) でラップ
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- storage.objects: message_images_authenticated_insert
DROP POLICY IF EXISTS "message_images_authenticated_insert" ON storage.objects;
CREATE POLICY "message_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-images'
  AND (storage.foldername(name))[1] = ((select auth.jwt())->>'sub')
);
