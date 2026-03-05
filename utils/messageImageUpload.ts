import { Platform } from 'react-native';
import { supabase } from '@/utils/supabaseClient';

const LOG_TAG = '[MessageImageUpload]';
const MESSAGE_IMAGES_BUCKET = 'message-images';

/** base64 を ArrayBuffer に変換（atob が無い React Native でも動作するフォールバック付き） */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
  } catch {
    // atob が無い or 失敗時は手動デコード
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = base64.replace(/=+$/, '').length;
  const byteLen = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = i + 2 < len ? lookup[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? lookup[base64.charCodeAt(i + 3)] : 0;
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLen) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLen) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

/** iOS の ph:// 等を file:// に変換してから読むためのフォールバック（expo-image-manipulator 使用） */
async function readImageViaManipulator(uri: string): Promise<ArrayBuffer | null> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const format = ImageManipulator.SaveFormat?.JPEG ?? ('jpeg' as any);
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: format as any,
    });
    const outUri = result?.uri;
    if (!outUri) {
      console.warn(LOG_TAG, 'manipulateAsync returned no uri');
      return null;
    }
    const FileSystem = await import('expo-file-system').catch(() => null) as any;
    const base64 = await FileSystem.readAsStringAsync(outUri, { encoding: FileSystem.EncodingType.Base64 });
    if (base64) return base64ToArrayBuffer(base64);
  } catch (e) {
    console.warn(LOG_TAG, 'readImageViaManipulator failed', e);
  }
  return null;
}

export type MessageImageUploadResult = { url: string } | { error: string };

/**
 * 画像を Supabase Storage (message-images) にアップロードし、公開URLまたはエラーを返す。
 * - RLS: パス先頭は auth.jwt()->>'sub' と一致させるため userId に認証ユーザーIDを渡すこと。
 * - base64FromPicker: ピッカーから base64 を渡すと確実（iOS では未返却になることがある）。
 */
export async function uploadMessageImage(
  localUri: string,
  userId: string,
  roomId: string,
  base64FromPicker?: string
): Promise<MessageImageUploadResult> {
  let arrayBuffer: ArrayBuffer | null = null;

  try {
    if (base64FromPicker && base64FromPicker.length > 0) {
      console.log(LOG_TAG, 'step: using base64 from picker, length=', base64FromPicker.length);
      arrayBuffer = base64ToArrayBuffer(base64FromPicker);
    } else if (Platform.OS === 'web') {
      console.log(LOG_TAG, 'step: web fetch', localUri.slice(0, 80));
      const response = await fetch(localUri);
      if (!response.ok) {
        console.warn(LOG_TAG, 'web fetch failed', response.status);
        return { error: `画像の読み込みに失敗しました (${response.status})` };
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      // ネイティブ: base64 が無い場合 fetch → FileSystem → ImageManipulator の順で試す
      console.log(LOG_TAG, 'step: native, uri scheme=', localUri.slice(0, 20), 'base64FromPicker=', !!base64FromPicker);
      try {
        const res = await fetch(localUri);
        if (res.ok) arrayBuffer = await res.arrayBuffer();
      } catch (fetchErr) {
        console.warn(LOG_TAG, 'native fetch failed (expected for ph:// on iOS)', fetchErr);
      }
      if (!arrayBuffer) {
        try {
          const FileSystem = await import('expo-file-system').catch(() => null) as any;
          const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64) arrayBuffer = base64ToArrayBuffer(base64);
        } catch (fsErr) {
          console.warn(LOG_TAG, 'FileSystem.readAsStringAsync failed', fsErr);
        }
      }
      if (!arrayBuffer) {
        console.log(LOG_TAG, 'step: trying ImageManipulator fallback (ph:// etc.)');
        arrayBuffer = await readImageViaManipulator(localUri);
      }
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn(LOG_TAG, 'no image data: arrayBuffer=', !!arrayBuffer, 'byteLength=', arrayBuffer?.byteLength);
      return { error: '画像データが取得できませんでした。別の画像をお試しください。' };
    }
    console.log(LOG_TAG, 'image read ok, size=', arrayBuffer.byteLength);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, 'read failed', e);
    return { error: `画像の読み込みに失敗しました: ${msg}` };
  }

  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/${roomId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
  console.log(LOG_TAG, 'uploading to', MESSAGE_IMAGES_BUCKET, filePath);

  try {
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_IMAGES_BUCKET)
      .upload(filePath, arrayBuffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn(LOG_TAG, 'storage upload error', uploadError.message, uploadError.name, uploadError);
      return { error: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
    const publicUrl = (data?.publicUrl ?? '').trim();
    if (!publicUrl) {
      console.warn(LOG_TAG, 'getPublicUrl returned empty');
      return { error: '公開URLの取得に失敗しました' };
    }
    console.log(LOG_TAG, 'upload success', publicUrl.slice(0, 60));
    return { url: publicUrl + '?t=' + Date.now() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, 'upload exception', e);
    return { error: `アップロードに失敗しました: ${msg}` };
  }
}

/** タイムライン投稿用画像アップロード（Supabase Storage REST API を fetch で直接呼び出す）
 *
 * Supabase JS クライアントの .upload() は React Native で ArrayBuffer を正しく
 * 送信できない場合があるため、REST API に直接 fetch することで確実に動作させる。
 */
export async function uploadTimelineImage(
  localUri: string,
  userId: string,
  base64FromPicker?: string
): Promise<MessageImageUploadResult> {
  console.log(LOG_TAG, '[Timeline] upload start, uri=', localUri?.slice(0, 40), 'hasBase64=', !!base64FromPicker);

  // 画像バイナリを取得
  const arrayBuffer = await (async (): Promise<ArrayBuffer | null> => {
    if (base64FromPicker?.length) {
      const buf = base64ToArrayBuffer(base64FromPicker);
      console.log(LOG_TAG, '[Timeline] base64 decoded, byteLength=', buf.byteLength);
      return buf;
    }
    if (Platform.OS === 'web') {
      const res = await fetch(localUri);
      return res.ok ? res.arrayBuffer() : null;
    }
    console.log(LOG_TAG, '[Timeline] no base64, trying manipulator fallback');
    return readImageViaManipulator(localUri);
  })();

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    console.warn(LOG_TAG, '[Timeline] no image data: arrayBuffer=', !!arrayBuffer, 'byteLength=', arrayBuffer?.byteLength);
    return { error: '画像データの取得に失敗しました。別の画像をお試しください。' };
  }

  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/timeline/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

  try {
    // 認証トークン取得
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      console.warn(LOG_TAG, '[Timeline] no auth token');
      return { error: '認証セッションが取得できませんでした。再ログインしてください。' };
    }

    // Supabase Storage REST API へ直接 fetch（JS クライアント経由より React Native で安定）
    const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${MESSAGE_IMAGES_BUCKET}/${filePath}`;

    console.log(LOG_TAG, '[Timeline] uploading to REST API, byteLength=', arrayBuffer.byteLength, 'contentType=', contentType);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(LOG_TAG, '[Timeline] storage upload failed', response.status, errText);
      return { error: `アップロードに失敗しました (${response.status}): ${errText}` };
    }

    const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
    const publicUrl = (data?.publicUrl ?? '').trim();
    if (!publicUrl) return { error: '公開URLの取得に失敗しました' };

    console.log(LOG_TAG, '[Timeline] upload success, publicUrl=', publicUrl.slice(0, 60));
    return { url: publicUrl + '?t=' + Date.now() };
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
