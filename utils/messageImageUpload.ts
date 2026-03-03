import { Platform } from 'react-native';
import { supabase } from '@/utils/supabaseClient';

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

export type MessageImageUploadResult = { url: string } | { error: string };

/**
 * 画像を Supabase Storage (message-images) にアップロードし、公開URLまたはエラーを返す。
 * - RLS: パス先頭は auth.jwt()->>'sub' と一致させるため userId に認証ユーザーIDを渡すこと。
 * - base64FromPicker: ピッカーから base64 を渡すと確実（ネイティブでは fetch(ph://) が失敗しやすい）。
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
      arrayBuffer = base64ToArrayBuffer(base64FromPicker);
    } else if (Platform.OS === 'web') {
      const response = await fetch(localUri);
      if (!response.ok) return { error: `画像の読み込みに失敗しました (${response.status})` };
      arrayBuffer = await response.arrayBuffer();
    } else {
      try {
        const res = await fetch(localUri);
        if (res.ok) arrayBuffer = await res.arrayBuffer();
      } catch {
        // ネイティブで fetch が失敗する場合
      }
      if (!arrayBuffer) {
        try {
          const FileSystem = await import('expo-file-system/legacy').catch(() => import('expo-file-system'));
          const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64) arrayBuffer = base64ToArrayBuffer(base64);
        } catch (fsErr) {
          const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          return { error: `画像の読み込みに失敗しました。${msg}` };
        }
      }
    }
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return { error: '画像データが空です' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Message image read failed', e);
    return { error: `画像の読み込みに失敗: ${msg}` };
  }

  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/${roomId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_IMAGES_BUCKET)
      .upload(filePath, arrayBuffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.log('Message image upload error:', uploadError.message, uploadError.name);
      return { error: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
    const publicUrl = (data?.publicUrl ?? '').trim();
    if (!publicUrl) return { error: '公開URLの取得に失敗しました' };
    return { url: publicUrl + '?t=' + Date.now() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Message image upload failed', e);
    return { error: `アップロードに失敗: ${msg}` };
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
