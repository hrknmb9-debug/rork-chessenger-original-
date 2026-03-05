import { Platform } from 'react-native';
import { supabase } from '@/utils/supabaseClient';

const LOG_TAG = '[MessageImageUpload]';
const MESSAGE_IMAGES_BUCKET = 'message-images';

export type MessageImageUploadResult = { url: string } | { error: string };

/**
 * base64 文字列から Blob を生成する（iOS / Android / Web 共通）。
 *
 * 設計方針:
 * - fetch body に Blob を渡すと React Native 0.71+ で安定動作する
 * - ArrayBuffer は一部の iOS/Hermes バージョンでシリアライズ問題が発生するため使わない
 * - Supabase JS クライアントに渡すと Authorization + apikey ヘッダーが自動付加される
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type: mimeType });
}

/**
 * ローカル URI から base64 文字列を取得する（iOS/Android 専用）。
 *
 * 優先順位:
 * 1. ピッカーが返した base64（最速・ファイル読み込み不要）
 * 2. expo-file-system で file:// を読む（ピッカーが base64 を返さない場合のフォールバック）
 * 3. expo-image-manipulator で ph:// / assets-library:// を file:// に変換してから読む
 */
async function getNativeBase64(localUri: string, base64FromPicker?: string): Promise<string | null> {
  // 1. ピッカー提供 base64（最優先）
  if (base64FromPicker?.length) return base64FromPicker;

  const FileSystem = await import('expo-file-system');

  // 2. file:// を直接読む
  if (localUri.startsWith('file://')) {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    }).catch((e) => {
      console.warn(LOG_TAG, 'FileSystem.readAsStringAsync failed:', e);
      return null;
    });
    if (b64) return b64;
  }

  // 3. ph:// / assets-library:// → ImageManipulator で file:// に変換してから読む
  try {
    const IM = await import('expo-image-manipulator');
    const fmt = IM.SaveFormat?.JPEG ?? ('jpeg' as unknown as import('expo-image-manipulator').SaveFormat);
    const converted = await IM.manipulateAsync(localUri, [], { compress: 0.85, format: fmt });
    return await FileSystem.readAsStringAsync(converted.uri, {
      encoding: FileSystem.EncodingType.Base64,
    }).catch(() => null);
  } catch (e) {
    console.warn(LOG_TAG, 'ImageManipulator fallback failed:', e);
    return null;
  }
}

/**
 * Blob を Supabase Storage にアップロードして公開 URL を返す共通実装。
 *
 * Supabase JS クライアント経由のため Authorization + apikey ヘッダーが自動付加される。
 * 以前使用していた手動 fetch / FileSystem.uploadAsync は:
 *   - apikey ヘッダーが欠落しやすい（400/401 サイレント失敗）
 *   - iOS ネイティブブリッジ越しの ArrayBuffer が不安定
 * のため廃止した。Blob + Supabase JS クライアントが最も信頼性が高い。
 */
async function uploadBlobToStorage(blob: Blob, filePath: string, contentType: string): Promise<MessageImageUploadResult> {
  console.log(LOG_TAG, 'uploading blob size=', blob.size, 'path=', filePath);

  const { error: uploadError } = await supabase.storage
    .from(MESSAGE_IMAGES_BUCKET)
    .upload(filePath, blob, { contentType, cacheControl: '31536000', upsert: false });

  if (uploadError) {
    console.warn(LOG_TAG, 'upload error:', uploadError.message);
    return { error: `アップロードに失敗しました: ${uploadError.message}` };
  }

  const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
  const publicUrl = (data?.publicUrl ?? '').trim();
  if (!publicUrl) return { error: '公開URLの取得に失敗しました' };

  console.log(LOG_TAG, 'upload success');
  return { url: publicUrl + '?t=' + Date.now() };
}

/**
 * チャット用画像アップロード。
 * base64 → Blob → Supabase JS クライアントの一本道で iOS / Web 両対応。
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
    let blob: Blob | null = null;

    if (Platform.OS === 'web') {
      // Web: blob: URI を fetch で読んで Blob を取得
      const res = await fetch(localUri).catch(() => null);
      if (res?.ok) blob = await res.blob().catch(() => null);
    } else {
      // iOS / Android: base64 → Blob（FileSystem 経由フォールバック含む）
      const base64 = await getNativeBase64(localUri, base64FromPicker);
      if (base64?.length) blob = base64ToBlob(base64, contentType);
    }

    if (!blob || blob.size === 0) {
      return { error: '画像データが取得できませんでした。別の画像をお試しください。' };
    }

    return uploadBlobToStorage(blob, filePath, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_TAG, '[Chat] upload exception:', msg);
    return { error: `アップロードに失敗しました: ${msg}` };
  }
}

/**
 * タイムライン投稿用画像アップロード。
 * base64 → Blob → Supabase JS クライアントの一本道で iOS / Web 両対応。
 *
 * 【iOS での問題履歴と解決策】
 * - Supabase JS .upload() + ArrayBuffer: iOS ブリッジでシリアライズ不安定 → 廃止
 * - FileSystem.uploadAsync: apikey ヘッダー欠落で 401、また auth 処理が手動で煩雑 → 廃止
 * - 現在: base64 → Blob → Supabase JS .upload() が最もシンプルかつ確実
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
    let blob: Blob | null = null;

    if (Platform.OS === 'web') {
      // Web: blob: URI を fetch で読んで Blob を取得
      const res = await fetch(localUri).catch(() => null);
      if (res?.ok) blob = await res.blob().catch(() => null);
    } else {
      // iOS / Android: base64 → Blob（FileSystem 経由フォールバック含む）
      const base64 = await getNativeBase64(localUri, base64FromPicker);
      if (base64?.length) blob = base64ToBlob(base64, contentType);
    }

    if (!blob || blob.size === 0) {
      console.warn(LOG_TAG, '[Timeline] failed to get blob');
      return { error: '画像データの取得に失敗しました。別の画像をお試しください。' };
    }

    return uploadBlobToStorage(blob, filePath, contentType);
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
