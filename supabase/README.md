# Supabase

## Edge Function: translate

翻訳用 Edge Function はデフォルトで JWT 検証が有効です。`config.toml` で `verify_jwt = false` を指定済みですが、デプロイ時に明示的に指定する場合:

```bash
supabase functions deploy translate --no-verify-jwt
```

※ ローカル開発は `supabase config.toml` の設定を参照します。

## メッセージ画像用ストレージ（message-images）

**バケットが存在しない場合**は、次のいずれかで作成とRLSを適用してください。

### 方法A: SQL Editor で一括実行（推奨）

1. Supabase Dashboard → **SQL Editor** を開く  
2. `scripts/create_message_images_bucket.sql` の内容をコピーして貼り付け、**Run** で実行  
3. これで `message-images` バケットの作成と次のRLSが適用されます  
   - **INSERT**: 認証済みユーザー（authenticated）が自分のフォルダ（`userId/roomId/`）にのみアップロード可能  
   - **SELECT**: 認証済みユーザーおよび公開（public）で画像表示可能  

### 方法B: マイグレーションで適用

ローカルで `supabase link` のうえ `supabase db push` を実行し、  
`migrations/20250303000000_message_images_storage.sql` を適用してください。

---

適用後、アプリから画像を送信すると Storage にアップロードされ、`messages.image_url` に公開URLが保存されます。
