-- RLS for message-images bucket.
-- Create the bucket in Supabase Dashboard: Storage → New bucket → id: message-images, Public: ON

-- Allow authenticated users to upload to their own folder: userId/roomId/filename
-- Path format: ${userId}/${roomId}/${Date.now()}.${fileExt}
DROP POLICY IF EXISTS "message_images_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "message_images_public_select" ON storage.objects;

CREATE POLICY "message_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-images'
  AND (storage.foldername(name))[1] = (auth.jwt()->>'sub')
);

-- Allow public read so getPublicUrl() works for displaying images in chat
CREATE POLICY "message_images_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'message-images');
