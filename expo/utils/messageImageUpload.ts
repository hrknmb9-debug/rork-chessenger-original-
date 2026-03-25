import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/utils/supabaseClient';

const LOG_TAG = '[MessageImageUpload]';
const MESSAGE_IMAGES_BUCKET = 'message-images';

export type MessageImageUploadResult = { url: string } | { error: string };

// ─── ユーティリティ ───────────────────────────────────────────────────────────

/** ph:// / assets-library:// を file:// に正規化（iOS写真ライブラリ URI 対策） */
async function normalizeToCachePath(localUri: string): Promise<string> {
  if (localUri.startsWith('file://')) return localUri;
  try {
    const fmt = ImageManipulator.SaveFormat?.JPEG ?? ImageManipulator.SaveFormat.JPEG;
    const r = await ImageManipulator.manipulateAsync(localUri, [], { compress: 0.85, format: fmt });
    return r.uri;
  } catch (e) {
    console.warn(LOG_TAG, 'normalizeToCachePath failed:', e);
    return localUri;
  }
}

/** Supabase Storage の公開 URL を返す */
function getPublicUrl(filePath: string): string {
  const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
  return (data?.publicUrl ?? '').trim();
}

// ─── iOS/Android: FileSystem.uploadAsync（第一手段・実証済みネイティブ） ──────

/**
 * expo-file-system の uploadAsync を使った iOS/Android 専用アップロード。
 *
 * 【選定理由】
 * - iOS ネイティブ HTTP スタック（NSURLSession）を直接使用
 * - ファイルを JS メモリに展開せず直接ストリーム送信 → メモリ圧迫なし
 * - Content-Type / Authorization / apikey ヘッダーを確実に送信できる
 * - チャット画像で実績あり（既知の動作確認済み）
 *
 * 【以前 timeline で失敗した理由】
 * apikey ヘッダーが欠落していたため Supabase ゲートウェイが 401 を返していた。
 * 現在は apikey を明示的に含めているため解消済み。
 */
async function uploadViaFileSystem(
  fileUri: string,
  filePath: string,
  contentType: string
): Promise<MessageImageUploadResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { error: '認証セッションが取得できませんでした。再ログインしてください。' };

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${MESSAGE_IMAGES_BUCKET}/${filePath}`;

  console.log(LOG_TAG, '[FS] uploading path=', filePath, 'uri=', fileUri?.slice(0, 60));

  const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
  });

  console.log(LOG_TAG, '[FS] status=', result.status, 'body=', result.body?.slice(0, 120));

  if (result.status >= 200 && result.status < 300) {
    const publicUrl = getPublicUrl(filePath);
    if (publicUrl) {
      console.log(LOG_TAG, '[FS] upload success');
      return { url: publicUrl + '?t=' + Date.now() };
    }
    return { error: '公開URLの取得に失敗しました' };
  }

  return { error: `アップロードに失敗しました (HTTP ${result.status}): ${result.body?.slice(0, 100) ?? ''}` };
}

// ─── フォールバック: XHR アップロード（FileSystem 失敗時のみ） ────────────────

/**
 * XHR で直接 Supabase Storage REST API にアップロードするフォールバック。
 *
 * 【XHR upload を第一手段にしない理由】
 * - React Native では xhr.send(blob) 時に iOS ネイティブが Content-Type を
 *   Blob の type プロパティで上書きする場合がある。
 *   file:// XHR 読み込み時に Blob の type が空になると
 *   アップロードリクエストの Content-Type が消え Supabase が拒否する。
 * - XHR の file:// GET は React Native によっては status=0 を返すため
 *   200 のみチェックすると常に失敗扱いになる。
 *
 * FileSystem.uploadAsync が失敗した場合のみ試みる。
 */
async function uploadViaXHRFallback(
  localUri: string,
  filePath: string,
  contentType: string,
  base64FromPicker?: string
): Promise<MessageImageUploadResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { error: '認証セッションが取得できませんでした。再ログインしてください。' };

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${MESSAGE_IMAGES_BUCKET}/${filePath}`;

  // Blob 取得: XHR read（status 0 も正常扱い）または base64FromPicker
  let blob: Blob | null = await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    // file:// URI は status=0 で成功する場合があるため response の有無で判定
    xhr.onload = () => resolve(xhr.response ? (xhr.response as Blob) : null);
    xhr.onerror = () => resolve(null);
    xhr.open('GET', localUri);
    xhr.send();
  });

  if (!blob || blob.size === 0) {
    if (base64FromPicker?.length) {
      const binary = atob(base64FromPicker);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes.buffer], { type: contentType });
    }
  }

  if (!blob || blob.size === 0) {
    return { error: '画像データの取得に失敗しました。別の画像をお試しください。' };
  }

  console.log(LOG_TAG, '[XHR fallback] uploading blob size=', blob.size);

  const status = await new Promise<number>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    // Blob の type が正しく設定されていれば XHR が自動で Content-Type を付与する
    // 空の場合に備えて明示的にも設定する
    if (!blob!.type) xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.send(blob);
  });

  if (status >= 200 && status < 300) {
    const publicUrl = getPublicUrl(filePath);
    if (publicUrl) {
      console.log(LOG_TAG, '[XHR fallback] upload success');
      return { url: publicUrl + '?t=' + Date.now() };
    }
    return { error: '公開URLの取得に失敗しました' };
  }

  return { error: `アップロードに失敗しました (XHR fallback HTTP ${status})` };
}

// ─── Web: Supabase JS クライアント（FormData は Web で正常動作） ─────────────

async function uploadViaSupabaseClientWeb(blob: Blob, filePath: string, contentType: string): Promise<MessageImageUploadResult> {
  console.log(LOG_TAG, '[Web] uploading blob size=', blob.size, 'path=', filePath);

  const { error } = await supabase.storage
    .from(MESSAGE_IMAGES_BUCKET)
    .upload(filePath, blob, { contentType, cacheControl: '31536000', upsert: false });

  if (error) {
    console.warn(LOG_TAG, '[Web] upload error:', error.message);
    return { error: `アップロードに失敗しました: ${error.message}` };
  }

  const publicUrl = getPublicUrl(filePath);
  if (!publicUrl) return { error: '公開URLの取得に失敗しました' };

  console.log(LOG_TAG, '[Web] upload success');
  return { url: publicUrl + '?t=' + Date.now() };
}

// ─── 公開 API ────────────────────────────────────────────────────────────────

/**
 * チャット用画像アップロード。
 *
 * iOS/Android:
 *   第1: FileSystem.uploadAsync（ネイティブHTTP・実証済み・チャットで動作確認済み）
 *   第2: XHR fallback（FileSystem 失敗時のみ）
 * Web:
 *   fetch(blob:URI) → Supabase JS クライアント
 */
export async function uploadMessageImage(
  localUri: string,
  userId: string,
  roomId: string,
  base64FromPicker?: string
): Promise<MessageImageUploadResult> {
  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/${roomId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

  console.log(LOG_TAG, '[Chat] upload start, platform=', Platform.OS, 'hasBase64=', !!base64FromPicker);

  try {
    if (Platform.OS === 'web') {
      const res = await fetch(localUri).catch(() => null);
      const blob = res?.ok ? await res.blob().catch(() => null) : null;
      if (!blob || blob.size === 0) return { error: '画像データが取得できませんでした。' };
      return uploadViaSupabaseClientWeb(blob, filePath, contentType);
    }

    // iOS / Android ─────────────────────────────────────────────────────────
    const fileUri = await normalizeToCachePath(localUri);

    // 第1: FileSystem.uploadAsync（ネイティブ・確実）
    const fsResult = await uploadViaFileSystem(fileUri, filePath, contentType);
    if ('url' in fsResult) return fsResult;

    // 第2: XHR fallback（FileSystem 失敗時のみ）
    console.warn(LOG_TAG, '[Chat] FileSystem failed, trying XHR fallback. error=', fsResult.error);
    return uploadViaXHRFallback(fileUri, filePath, contentType, base64FromPicker);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, '[Chat] upload exception:', msg);
    return { error: `アップロードに失敗しました: ${msg}` };
  }
}

/**
 * タイムライン投稿用画像アップロード。
 *
 * iOS/Android:
 *   第1: FileSystem.uploadAsync（ネイティブHTTP・apikey 付き）
 *   第2: XHR fallback（FileSystem 失敗時のみ）
 * Web:
 *   fetch(blob:URI) → Supabase JS クライアント
 *
 * 【iOS 試行錯誤の履歴】
 * 1. ArrayBuffer + fetch: Hermes ブリッジでシリアライズ不安定 → 廃止
 * 2. FileSystem.uploadAsync のみ: apikey ヘッダー欠落で 401 → apikey 追加で修正
 * 3. base64ToBlob: atob()+ループが同期 → 大きな画像で UI フリーズ → 廃止
 * 4. Blob + Supabase JS storage.upload(): storage-js が FormData.append('',blob) にラップ
 *    → React Native の FormData は空キーの Blob append を正常処理できない → 廃止
 * 5. XHR read(file://) + XHR upload: file:// 読み込みが status=0 を返し常に失敗 → 廃止
 * 6. 現在: FileSystem.uploadAsync（第1）+ XHR fallback（第2）
 */
export async function uploadTimelineImage(
  localUri: string,
  userId: string,
  base64FromPicker?: string
): Promise<MessageImageUploadResult> {
  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/timeline/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

  console.log(LOG_TAG, '[Timeline] upload start, platform=', Platform.OS, 'uri=', localUri?.slice(0, 50), 'hasBase64=', !!base64FromPicker);

  try {
    if (Platform.OS === 'web') {
      const res = await fetch(localUri).catch(() => null);
      const blob = res?.ok ? await res.blob().catch(() => null) : null;
      if (!blob || blob.size === 0) {
        console.warn(LOG_TAG, '[Timeline] web fetch failed');
        return { error: '画像データの取得に失敗しました。別の画像をお試しください。' };
      }
      return uploadViaSupabaseClientWeb(blob, filePath, contentType);
    }

    // iOS / Android ─────────────────────────────────────────────────────────
    const fileUri = await normalizeToCachePath(localUri);

    // 第1: FileSystem.uploadAsync（ネイティブ・確実）
    const fsResult = await uploadViaFileSystem(fileUri, filePath, contentType);
    if ('url' in fsResult) return fsResult;

    // 第2: XHR fallback（FileSystem 失敗時のみ）
    console.warn(LOG_TAG, '[Timeline] FileSystem failed, trying XHR fallback. error=', fsResult.error);
    return uploadViaXHRFallback(fileUri, filePath, contentType, base64FromPicker);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, '[Timeline] upload exception:', msg);
    return { error: `アップロードに失敗しました: ${msg}` };
  }
}

const IMG_PREFIX = '__IMG__';

export function encodeImageContent(uri: string): string {
  return IMG_PREFIX + uri;
}

export function decodeMessageContent(content: string): { isImage: boolean; value: string } {
  if (content.startsWith(IMG_PREFIX)) {
    return { isImage: true, value: content.slice(IMG_PREFIX.length) };
  }
  return { isImage: false, value: content };
}

export function isImageMessageContent(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.startsWith(IMG_PREFIX);
}

export function getImageUrlFromContent(text: string): string {
  return text.startsWith(IMG_PREFIX) ? text.slice(IMG_PREFIX.length) : '';
}

/** ブラウザ/WebView で安全に表示できる画像URLか（file:// やローカルパスは false） */
export function isLoadableImageUrl(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== 'string' || !uri.trim()) return false;
  const u = uri.trim();
  return u.startsWith('http://') || u.startsWith('https://');
}
