import { Platform } from 'react-native';
import { supabase } from '@/utils/supabaseClient';

const LOG_TAG = '[MessageImageUpload]';
const MESSAGE_IMAGES_BUCKET = 'message-images';

export type MessageImageUploadResult = { url: string } | { error: string };

// ─── ネイティブ Blob 取得（XHR: ノンブロッキング） ──────────────────────────

/**
 * XHR で file:// URI から Blob を読み込む。
 *
 * なぜ base64ToBlob ではなく XHR か:
 *   atob() + Uint8Array ループは同期処理のため、2MB 以上の画像で
 *   JS スレッドを数秒ブロックし UI が完全フリーズする。
 *   XHR の responseType='blob' は React Native ネイティブスタックで動作し
 *   JS スレッドをブロックしない。
 */
function readFileAsBlob(fileUri: string, mimeType: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.status === 200 && xhr.response ? (xhr.response as Blob) : null);
    xhr.onerror = () => { console.warn(LOG_TAG, 'XHR read error:', fileUri?.slice(0, 50)); resolve(null); };
    xhr.open('GET', fileUri);
    xhr.setRequestHeader('Accept', mimeType);
    xhr.send();
  });
}

/** ph:// / assets-library:// を file:// に変換（ImageManipulator 経由） */
async function normalizeToCachePath(localUri: string): Promise<string> {
  if (localUri.startsWith('file://')) return localUri;
  try {
    const IM = await import('expo-image-manipulator');
    const fmt = IM.SaveFormat?.JPEG ?? ('jpeg' as unknown as import('expo-image-manipulator').SaveFormat);
    const r = await IM.manipulateAsync(localUri, [], { compress: 0.85, format: fmt });
    return r.uri;
  } catch (e) {
    console.warn(LOG_TAG, 'normalizeToCachePath failed:', e);
    return localUri;
  }
}

// ─── iOS/Android アップロード（XHR 直接: FormData 回避） ─────────────────────

/**
 * Blob を XHR で直接 Supabase Storage REST API にアップロードする。
 *
 * 【なぜ Supabase JS storage.upload() を使わないのか】
 * storage-js v2 は Blob を渡すと強制的に FormData.append('', blob) にラップする。
 * React Native では FormData に空キーで Blob を追加する操作が正常に動作せず、
 * サイレントに失敗する。XHR で Blob を直接 send() すると
 * React Native ネイティブ HTTP スタックが生バイナリとして送信するため確実に動作する。
 */
async function uploadBlobViaXHR(
  blob: Blob,
  filePath: string,
  contentType: string
): Promise<MessageImageUploadResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { error: '認証セッションが取得できませんでした。再ログインしてください。' };

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${MESSAGE_IMAGES_BUCKET}/${filePath}`;

  console.log(LOG_TAG, '[XHR] uploading blob size=', blob.size, 'path=', filePath);

  const status = await new Promise<number>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => { console.warn(LOG_TAG, '[XHR] network error'); resolve(0); };
    xhr.send(blob);
  });

  if (status >= 200 && status < 300) {
    const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
    const publicUrl = (data?.publicUrl ?? '').trim();
    if (publicUrl) {
      console.log(LOG_TAG, '[XHR] upload success');
      return { url: publicUrl + '?t=' + Date.now() };
    }
    return { error: '公開URLの取得に失敗しました' };
  }

  return { error: `アップロードに失敗しました (HTTP ${status})` };
}

// ─── Web アップロード（Supabase JS クライアント: FormData は Web で正常動作） ─

async function uploadBlobViaSupabaseClient(blob: Blob, filePath: string, contentType: string): Promise<MessageImageUploadResult> {
  console.log(LOG_TAG, '[Web] uploading blob size=', blob.size, 'path=', filePath);

  const { error } = await supabase.storage
    .from(MESSAGE_IMAGES_BUCKET)
    .upload(filePath, blob, { contentType, cacheControl: '31536000', upsert: false });

  if (error) {
    console.warn(LOG_TAG, '[Web] upload error:', error.message);
    return { error: `アップロードに失敗しました: ${error.message}` };
  }

  const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
  const publicUrl = (data?.publicUrl ?? '').trim();
  if (!publicUrl) return { error: '公開URLの取得に失敗しました' };

  console.log(LOG_TAG, '[Web] upload success');
  return { url: publicUrl + '?t=' + Date.now() };
}

// ─── 公開 API ────────────────────────────────────────────────────────────────

/**
 * チャット用画像アップロード。
 * iOS/Android: XHR read + XHR upload（FormData 回避・ノンブロッキング）
 * Web: fetch Blob + Supabase JS クライアント
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
      return uploadBlobViaSupabaseClient(blob, filePath, contentType);
    }

    // iOS / Android ─────────────────────────────────────────────────────────
    const fileUri = await normalizeToCachePath(localUri);
    let blob = await readFileAsBlob(fileUri, contentType);

    if (!blob || blob.size === 0) {
      console.warn(LOG_TAG, '[Chat] XHR read failed, trying base64 fallback');
      // フォールバック: base64FromPicker が存在すれば Blob に変換
      if (base64FromPicker?.length) {
        const binary = atob(base64FromPicker);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes.buffer], { type: contentType });
      }
    }

    if (!blob || blob.size === 0) return { error: '画像データが取得できませんでした。別の画像をお試しください。' };
    return uploadBlobViaXHR(blob, filePath, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, '[Chat] upload exception:', msg);
    return { error: `アップロードに失敗しました: ${msg}` };
  }
}

/**
 * タイムライン投稿用画像アップロード。
 * iOS/Android: XHR read + XHR upload（FormData 回避・ノンブロッキング）
 * Web: fetch Blob + Supabase JS クライアント
 *
 * 【iOS 問題履歴】
 * 1. ArrayBuffer + fetch: iOS Hermes ブリッジで不安定 → 廃止
 * 2. FileSystem.uploadAsync: apikey ヘッダー欠落で 401 → 廃止
 * 3. base64ToBlob: atob() ループが同期 → 大きな画像で UI フリーズ → 廃止
 * 4. Blob + Supabase JS storage.upload(): storage-js が FormData.append('',blob) にラップ
 *    → React Native の FormData は空キーの Blob append を正常処理できない → 廃止
 * 5. 現在: XHR read(file://) + XHR upload(blob) が React Native ネイティブ HTTP
 *    スタックを使い最も確実に動作する
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
      return uploadBlobViaSupabaseClient(blob, filePath, contentType);
    }

    // iOS / Android ─────────────────────────────────────────────────────────
    const fileUri = await normalizeToCachePath(localUri);
    let blob = await readFileAsBlob(fileUri, contentType);

    if (!blob || blob.size === 0) {
      console.warn(LOG_TAG, '[Timeline] XHR read failed, trying base64 fallback');
      if (base64FromPicker?.length) {
        const binary = atob(base64FromPicker);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes.buffer], { type: contentType });
      }
    }

    if (!blob || blob.size === 0) {
      console.warn(LOG_TAG, '[Timeline] failed to get blob');
      return { error: '画像データの取得に失敗しました。別の画像をお試しください。' };
    }

    return uploadBlobViaXHR(blob, filePath, contentType);
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
