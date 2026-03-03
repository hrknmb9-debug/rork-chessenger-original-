# Supabase

## メッセージ画像用ストレージ（message-images）

1. **バケット作成**  
   Supabase Dashboard → Storage → **New bucket**  
   - Name: `message-images`  
   - **Public bucket**: ON（チャットで画像URLをそのまま表示するため）

2. **RLS の適用**  
   Dashboard → SQL Editor で `migrations/20250303000000_message_images_storage.sql` の内容を実行するか、  
   ローカルで `supabase db push` を実行してマイグレーションを適用してください。

適用後、認証済みユーザーは自分のフォルダ（`userId/roomId/`）にのみアップロードでき、画像は公開読み取りになります。
