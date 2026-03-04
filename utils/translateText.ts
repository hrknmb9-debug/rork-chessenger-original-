/**
 * テキスト翻訳ユーティリティ
 * Supabase Edge Function または MyMemory 無料API を使用
 * 翻訳結果は AsyncStorage にキャッシュし API クォータを節約
 *
 * iOS/Android: RN の fetch で res.arrayBuffer() が未実装のため XMLHttpRequest を使用
 * Web: fetch + arrayBuffer を使用
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabaseClient';

/** iOS 同時接続制限対応: iOS は逐次処理（1件）、他は最大4件 */
const CONCURRENT_IOS = 1;
const CONCURRENT_OTHER = 4;
let activeCount = 0;
const waiting: Array<() => void> = [];

async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  const limit = Platform.OS === 'ios' ? CONCURRENT_IOS : CONCURRENT_OTHER;
  while (activeCount >= limit) {
    await new Promise<void>(resolve => { waiting.push(resolve); });
  }
  activeCount++;
  try {
    const result = await fn();
    if (Platform.OS === 'ios') {
      await new Promise(r => setTimeout(r, 50)); // 逐次間のディレイ（接続確実性）
    }
    return result;
  } finally {
    activeCount--;
    waiting.shift()?.();
  }
}

const TRANSLATE_CACHE_KEY = 'chess_translate_cache';
const CACHE_MAX_ENTRIES = 500;
const CACHE_VERSION = 7;
const TRANSLATE_DEBUG = __DEV__;

export type TranslateResult = { text: string } | { error: string };
export type TranslateOptions = { itemId?: string };

/** 見えない文字の徹底排除: 制御文字・ゼロ幅スペース等を除去（iOS fetch クラッシュ防止） */
function sanitizePayload(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 制御文字（\t\n\r 除く）
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')       // ゼロ幅スペース・ノンディレクティブ・BOM
    .replace(/[\u2028\u2029]/g, ' ')                   // 行区切り文字はスペースに
    .trim();
}

/** Base64 を UTF-8 文字列にデコード（atob → Buffer → 手動デコードの三段構え） */
function decodeBase64ToUtf8(base64: string): string {
  const toUtf8 = (bytes: Uint8Array): string => {
    try {
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  };
  try {
    const atobFn = globalThis.atob ?? (typeof atob !== 'undefined' ? atob : null);
    if (atobFn) {
      const binary = atobFn(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return toUtf8(bytes);
    }
  } catch {
    /* atob failed */
  }
  try {
    const B = (globalThis as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
    if (B?.from) {
      return B.from(base64, 'base64').toString('utf8');
    }
  } catch {
    /* Buffer failed */
  }
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    const len = base64.replace(/=+$/, '').length;
    const byteLen = (len * 3) >> 2;
    const bytes = new Uint8Array(byteLen);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = lookup[base64.charCodeAt(i)] ?? 0;
      const b = lookup[base64.charCodeAt(i + 1)] ?? 0;
      const c = i + 2 < len ? (lookup[base64.charCodeAt(i + 2)] ?? 0) : 0;
      const d = i + 3 < len ? (lookup[base64.charCodeAt(i + 3)] ?? 0) : 0;
      bytes[p++] = (a << 2) | (b >> 4);
      if (p < byteLen) bytes[p++] = ((b & 15) << 4) | (c >> 2);
      if (p < byteLen) bytes[p++] = ((c & 3) << 6) | d;
    }
    return toUtf8(bytes);
  } catch (e) {
    if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] Base64 decode failed:', e);
    return '';
  }
}

/** グローバルイベント: 翻訳完了のプル型通知 */
type TranslationCompletePayload = { itemId: string; text: string };
const translationListeners: Array<(p: TranslationCompletePayload) => void> = [];
export function onTranslationComplete(cb: (p: TranslationCompletePayload) => void): { remove: () => void } {
  translationListeners.push(cb);
  return { remove: () => { const i = translationListeners.indexOf(cb); if (i >= 0) translationListeners.splice(i, 1); } };
}
function emitTranslationComplete(payload: TranslationCompletePayload): void {
  if (__DEV__ && Platform.OS === 'ios' && (!payload.text || payload.text.trim() === '')) {
    console.error('[translate:ios] ERROR: Result is empty or undefined');
  }
  translationListeners.forEach(l => { try { l(payload); } catch { /* ignore */ } });
}

/** URLエンコード・不正エンコーディングの翻訳結果をデコード（iOS文字化け対策） */
function safeDecodeTranslated(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  if (s.length === 0) return text;
  try {
    // %XX 形式（スペース混入含む）をデコード：iOSで %E 3% 81% のような形式になることがある
    if (/%[0-9A-Fa-f]{2}/.test(s) || /%\s*[0-9A-Fa-f]/.test(s)) {
      const compact = s.replace(/\s+/g, ''); // 全スペース削除
      if (compact.length > 0) {
        let decoded = decodeURIComponent(compact);
        // 二重エンコード対策：結果にまだ %XX が残れば再デコード
        if (decoded && /%[0-9A-Fa-f]{2}/.test(decoded)) {
          try {
            decoded = decodeURIComponent(decoded);
          } catch {
            // 二重デコード失敗時は1回目を返す
          }
        }
        if (decoded && decoded.length > 0) return decoded;
      }
    }
    // 豆腐文字・置換文字の除去（iOS 絵文字破損時）
    if (/\uFFFD/.test(s)) s = s.replace(/\uFFFD/g, '');
    // 壊れたサロゲートペア（孤立したハイサロゲート）の除去
    s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');
  } catch {
    // デコード失敗時は元の文字列を返す
  }
  return s || text;
}

/** 翻訳表示用：UIレイヤーで最終デコードを適用（防御的） */
export function decodeForDisplay(text: string): string {
  return safeDecodeTranslated(text || '');
}

/** 12言語コード正規化 (ISO 639-1) — iOS の en-US, ja-JP 等を無視しアプリ設定を優先 */
const SUPPORTED_CODES = new Set(['en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'id', 'ja', 'ko']);
function normalizeLang(lang: string): string {
  const map: Record<string, string> = {
    en: 'en', 'en-us': 'en', 'en-gb': 'en', english: 'en',
    zh: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh', chinese: 'zh',
    hi: 'hi', hindi: 'hi',
    es: 'es', spanish: 'es',
    ar: 'ar', arabic: 'ar',
    fr: 'fr', french: 'fr',
    bn: 'bn', bengali: 'bn',
    pt: 'pt', portuguese: 'pt',
    ru: 'ru', russian: 'ru',
    id: 'id', indonesian: 'id',
    ja: 'ja', 'ja-jp': 'ja', japanese: 'ja',
    ko: 'ko', 'ko-kr': 'ko', korean: 'ko',
  };
  const lower = lang?.toLowerCase() ?? '';
  const mapped = map[lower] ?? (lower.slice(0, 2) || 'en');
  return SUPPORTED_CODES.has(mapped) ? mapped : 'en';
}

/** 設定言語から翻訳先言語を決定。アプリ内設定を常に優先、iOS システムロケールは参照しない */
export function getTargetLanguage(preferredLang?: string): string {
  const lang = preferredLang ?? 'en';
  return normalizeLang(lang);
}

/** 翻訳元言語を推定（日本語・中国語・韓国語・ベンガル語等の自動判定） */
function detectSourceLang(text: string): string {
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F]/.test(text)) return 'zh';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  return 'en';
}

type CacheEntry = { translated: string; target: string; source: string; v: number };

function cacheKey(text: string, target: string, source: string): string {
  const t = text.trim().slice(0, 200);
  return `${source}|${target}|${t}`;
}

async function getCached(text: string, target: string, source: string): Promise<string | null> {
  try {
    const key = cacheKey(text, target, source);
    const raw = await AsyncStorage.getItem(TRANSLATE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, CacheEntry>;
    const entry = data[key];
    if (entry?.v === CACHE_VERSION && entry.target === target && entry.source === source) {
      return entry.translated;
    }
  } catch {
    // ignore
  }
  return null;
}

async function setCache(text: string, target: string, source: string, translated: string): Promise<void> {
  try {
    const key = cacheKey(text, target, source);
    const raw = await AsyncStorage.getItem(TRANSLATE_CACHE_KEY);
    const data: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};
    data[key] = { translated, target, source, v: CACHE_VERSION };
    const keys = Object.keys(data);
    if (keys.length > CACHE_MAX_ENTRIES) {
      const toRemove = keys.slice(0, keys.length - CACHE_MAX_ENTRIES);
      toRemove.forEach(k => delete data[k]);
    }
    await AsyncStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** ArrayBuffer を UTF-8 文字列にデコード */
function decodeUtf8FromBuffer(buf: ArrayBuffer): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(buf);
  }
  const bytes = new Uint8Array(buf);
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b < 128) { s += String.fromCharCode(b); i++; }
    else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f)); i += 2;
    } else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f)); i += 3;
    } else if ((b & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      s += String.fromCodePoint(((b & 0x07) << 18) | ((bytes[i + 1]! & 0x3f) << 12) | ((bytes[i + 2]! & 0x3f) << 6) | (bytes[i + 3]! & 0x3f)); i += 4;
    } else { s += String.fromCharCode(b); i++; }
  }
  return s;
}

/** ArrayBuffer から JSON をパース */
function parseJsonFromArrayBuffer(buf: ArrayBuffer): Record<string, unknown> | null {
  try {
    if (buf && buf.byteLength > 0) {
      const rawText = decodeUtf8FromBuffer(buf);
      if (rawText?.trim()) return JSON.parse(rawText) as Record<string, unknown>;
    }
  } catch (e) {
    if (TRANSLATE_DEBUG) console.warn('[translate] parseJsonFromArrayBuffer failed:', e);
  }
  return null;
}

/** キャッシュバスティング: iOS で通信キャッシュを回避 */
function withCacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

/** iOS/Android: 15秒タイムアウト、1回リトライ（遅い回線での Network request failed を軽減） */
const XHR_TIMEOUT_MS = Platform.OS === 'web' ? 30000 : 15000;

/**
 * XHR で responseType: 'text' を使用して JSON 取得
 * iOS: arraybuffer が undefined になる場合があるため、text が確実
 */
function fetchJsonViaXHRText(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
  isRetry = false
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const targetUrl = options.method === 'POST' ? url : withCacheBust(url);
    xhr.open(options.method ?? 'GET', targetUrl, true);
    xhr.responseType = 'text'; // text は RN iOS で確実に動作
    xhr.timeout = XHR_TIMEOUT_MS;
    const headers = options.headers ?? {};
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.onload = () => {
      const status = xhr.status;
      const raw = xhr.responseText ?? xhr.response;
      const rawStr = typeof raw === 'string' ? raw : String(raw);
      if (__DEV__) {
        console.log('[translate] XHR onload status=', status, 'Platform=', Platform.OS);
        console.dir({ xhrResponse: { status, rawPreview: rawStr.slice(0, 400), rawLen: rawStr.length } }, { depth: 3 });
      }
      if (status >= 200 && status < 300) {
        if (typeof raw === 'string' && raw.trim()) {
          try {
            const text = raw.trim();
            const parsed = JSON.parse(text) as Record<string, unknown>;
            if (__DEV__) console.log('[translate] JSON parse OK, keys=', Object.keys(parsed));
            resolve(parsed);
          } catch (e) {
            if (TRANSLATE_DEBUG) console.warn('[translate:ios] XHR JSON parse failed:', e, 'raw preview:', String(raw).slice(0, 100));
            resolve(null);
          }
        } else {
          resolve(null);
        }
      } else {
        if (TRANSLATE_DEBUG) console.warn('[translate:ios] XHR status', status);
        resolve(null);
      }
    };
    xhr.onerror = () => {
      if (TRANSLATE_DEBUG) console.warn('[translate] XHR network error');
      resolve(null);
    };
    xhr.ontimeout = () => {
      if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] XHR timeout', isRetry ? '(retry failed)' : '');
      if (!isRetry && Platform.OS === 'ios') {
        const base = url.split('?')[0] || url;
        const retryUrl = `${base}?t=${Date.now()}`;
        if (__DEV__) console.log('[translate:ios] Retrying once, new URL=', retryUrl);
        fetchJsonViaXHRText(retryUrl, options, true).then(resolve);
        return;
      }
      resolve(null);
    };
    xhr.send(options.body ?? null);
  });
}

/** RN iOS/Android 用: XHR responseType 'text' で JSON 取得（arraybuffer は iOS で未実装のため） */
function fetchJsonViaXHR(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
  isRetry?: boolean
): Promise<Record<string, unknown> | null> {
  return fetchJsonViaXHRText(url, options, isRetry ?? false);
}

/**
 * fetch レスポンスを JSON にパース
 * - RN iOS/Android: res.arrayBuffer() が未実装のため null を返し、呼び出し側で XHR を使う
 * - Web: arrayBuffer 使用
 */
async function parseJsonFromFetchResponse(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const buf = await res.arrayBuffer();
    return parseJsonFromArrayBuffer(buf);
  } catch (e) {
    if (TRANSLATE_DEBUG) console.warn('[translate] parseJsonFromFetchResponse failed:', e);
  }
  return null;
}

/**
 * Supabase Edge Function で翻訳を試行
 * iOS: 直接 fetch を優先（invoke が Hermes/RN 環境で不安定な場合がある）
 * 全プラットフォーム: res.text() + JSON.parse で UTF-8 を確実に処理
 */
async function translateViaEdgeFunction(
  text: string,
  targetLang: string,
  sourceLang: string,
  accessToken?: string | null
): Promise<TranslateResult | null> {
  const sanitized = sanitizePayload(text);
  let token = accessToken ?? SUPABASE_ANON_KEY;
  if (Platform.OS === 'web') {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session?.access_token) {
        token = refreshed.session.access_token;
      }
    } catch {
      /* use existing token */
    }
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (TRANSLATE_DEBUG) console.warn('[translate] Missing SUPABASE_URL or ANON_KEY');
    return null;
  }

  const doFetch = async (): Promise<TranslateResult | null> => {
    const url = `${SUPABASE_URL}/functions/v1/translate?t=${Date.now()}`;
    const bodyStr = JSON.stringify({ text: sanitized, targetLang, sourceLang });
    const headers: Record<string, string> = {
      'Accept': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...(Platform.OS === 'ios' ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {}),
    };
    if (__DEV__ && Platform.OS === 'ios') {
      console.log('[translate:ios] === Request before send ===');
      console.log('[translate:ios] url=', url);
      console.log('[translate:ios] targetLang=', targetLang, 'sourceLang=', sourceLang, 'textLen=', text.length);
      console.log('[translate:ios] body preview=', bodyStr.slice(0, 120) + (bodyStr.length > 120 ? '...' : ''));
    }

    if (Platform.OS !== 'web') {
      // RN iOS/Android: XHR responseType 'text' で確実に取得、一度 text で受け取り JSON.parse
      let data = await fetchJsonViaXHR(url, { method: 'POST', headers, body: bodyStr });
      if (!data) {
        // フォールバック: fetch + res.text()（response.json() は使わない）+ 5秒タイムアウト・1回リトライ
        const tryFetch = async (targetUrl: string, retry = false): Promise<Record<string, unknown> | null> => {
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 15000);
          try {
            const res = await fetch(targetUrl, { method: 'POST', headers, body: bodyStr, signal: controller.signal });
            const rawText = await res.text();
            if (res.ok && rawText?.trim()) {
              try {
                return JSON.parse(rawText.trim()) as Record<string, unknown>;
              } catch {
                return null;
              }
            }
            return null;
          } catch (e) {
            if (!retry && Platform.OS === 'ios') {
              if (__DEV__) console.log('[translate:ios] Fetch timeout/error, retrying once...');
              return tryFetch(`${SUPABASE_URL}/functions/v1/translate?t=${Date.now()}`, true);
            }
            return null;
          } finally {
            clearTimeout(to);
          }
        };
        try {
          data = await tryFetch(url);
          if (data && __DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Fetch fallback OK');
        } catch (e) {
          if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] Fetch fallback error:', e);
        }
      }
      if (!data) {
        if (__DEV__) console.warn('[translate] empty/invalid response → fallback');
        return { text };
      }
      const err = data.error as string | undefined;
      if (err) {
        if (__DEV__) console.warn('[translate] API error:', err);
        return { text };
      }
      // バイパステスト: translatedText を優先（Base64 デコードをスキップ）
      const TRANSLATE_RAW_FIRST = true; // 一時 true: 生テキスト優先で Base64 不一致を検証
      const base64 = data.translatedTextBase64 as string | undefined;
      const raw = (data.translatedText ?? data.text) as string | undefined;
      if (__DEV__) console.dir({ translateResponse: data, hasBase64: !!base64, hasRaw: !!raw });
      let finalText = '';
      if (TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') {
        if (__DEV__) console.log('[translate] BYPASS: using translatedText (raw first)');
        finalText = safeDecodeTranslated(raw);
      }
      if (!finalText && base64 && typeof base64 === 'string') {
        const decoded = decodeBase64ToUtf8(base64);
        if (__DEV__) console.log('[translate] RAW RESULT:', decoded?.slice(0, 80) ?? '(empty)');
        if (decoded?.trim()) finalText = safeDecodeTranslated(decoded);
      }
      if (!finalText && !TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') {
        finalText = safeDecodeTranslated(raw);
      }
      if (finalText) return { text: finalText };
      if (__DEV__) console.warn('[translate] No valid translatedTextBase64 nor translatedText');
      return { text };
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
      const rawText = await res.text();
      if (__DEV__) console.dir({ webTranslateRes: { status: res.status, bodyPreview: rawText?.slice(0, 300) } }, { depth: 3 });
      let data: Record<string, unknown> | null = null;
      if (rawText?.trim()) {
        try {
          data = JSON.parse(rawText.trim()) as Record<string, unknown>;
        } catch (e) {
          if (TRANSLATE_DEBUG) console.warn('[translate] Web JSON parse failed:', e);
        }
      }
      if (!data) {
        return { text };
      }
      const err = data.error as string | undefined;
      if (err) {
        return { text };
      }
      const base64 = data.translatedTextBase64 as string | undefined;
      const raw = (data.translatedText ?? data.text) as string | undefined;
      const TRANSLATE_RAW_FIRST = true;
      let finalText = '';
      if (TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') {
        finalText = safeDecodeTranslated(raw);
      }
      if (!finalText && base64 && typeof base64 === 'string') {
        finalText = safeDecodeTranslated(decodeBase64ToUtf8(base64));
      }
      if (!finalText && !TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') {
        finalText = safeDecodeTranslated(raw);
      }
      if (finalText) return { text: finalText };
      return { text };
    } catch (e) {
      if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] fetch failed:', e);
      return { text };
    }
  };

  // ネイティブ(iOS/Android): invoke の fetch が Network request failed を起こすことがあるため XHR/doFetch を直接使用
  if (Platform.OS === 'web') {
    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { text: sanitized, targetLang, sourceLang },
      });
      if (__DEV__) console.dir({ invokeResult: { data, error } }, { depth: 4 });
      if (TRANSLATE_DEBUG && error) console.warn('[translate] invoke error:', error?.message ?? error);
      if (!error) {
        const TRANSLATE_RAW_FIRST = true;
        const base64 = data?.translatedTextBase64 as string | undefined;
        const raw = (data?.translatedText ?? data?.text) as string | undefined;
        let finalText = '';
        if (TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') finalText = safeDecodeTranslated(raw);
        if (!finalText && base64 && typeof base64 === 'string') finalText = safeDecodeTranslated(decodeBase64ToUtf8(base64));
        if (!finalText && !TRANSLATE_RAW_FIRST && raw && typeof raw === 'string') finalText = safeDecodeTranslated(raw);
        if (finalText) return { text: finalText };
      }
    } catch (e) {
      if (TRANSLATE_DEBUG) console.warn('[translate] invoke exception:', e);
    }
  }

  let result: TranslateResult | null = null;
  try {
    result = await doFetch();
  } catch (e) {
    if (TRANSLATE_DEBUG) console.warn('[translate] doFetch exception:', (e as Error)?.message ?? e);
  }
  if (result) return result;
  return null;
}

/**
 * MyMemory 無料API（バックアップ）
 */
async function translateViaMyMemory(text: string, targetLang: string, sourceLang: string): Promise<TranslateResult | null> {
  if (sourceLang === targetLang) return { text };
  const langpair = `${sourceLang}|${targetLang}`;
  const encoded = encodeURIComponent(text.slice(0, 500));
  const url = withCacheBust(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`);

  const myMemoryHeaders = { 'Accept': 'application/json; charset=utf-8' };
  if (Platform.OS !== 'web') {
    let data = await fetchJsonViaXHR(url, { method: 'GET', headers: myMemoryHeaders });
    if (!data) {
      try {
        const res = await fetch(url, { headers: myMemoryHeaders });
        if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] MyMemory fallback status=', res.status);
        const rawText = await res.text();
        if (res.ok && rawText?.trim()) {
          try {
            data = JSON.parse(rawText.trim()) as Record<string, unknown>;
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!data) return null;
    const resData = data.responseData as { translatedText?: string } | undefined;
    const raw = resData?.translatedText;
    if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
    return null;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await parseJsonFromFetchResponse(res);
    if (!data) return null;
    const resData = data.responseData as { translatedText?: string } | undefined;
    const raw = resData?.translatedText;
    if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
    return null;
  } catch {
    return null;
  }
}

/**
 * テキストを翻訳する（キャッシュ付き）
 * @param text 翻訳するテキスト
 * @param targetLang 翻訳先言語（設定で選択した言語、ja/en/zh/ko 等）
 * @param accessToken 未使用（supabase クライアントが自動でトークンを使用）
 */
export async function translateText(
  text: string,
  targetLang: string,
  accessToken?: string | null,
  options?: TranslateOptions
): Promise<TranslateResult> {
  const sanitized = sanitizePayload(text);
  const normalizedTarget = normalizeLang(targetLang);
  const sourceLang = detectSourceLang(sanitized);
  if (!sanitized?.trim()) return { error: 'Empty text' };
  if (sourceLang === normalizedTarget) {
    if (TRANSLATE_DEBUG) console.log('[translate] Skip: source===target', normalizedTarget);
    return { text: sanitized };
  }

  const cached = await getCached(sanitized, normalizedTarget, sourceLang);
  if (cached) return { text: safeDecodeTranslated(cached) };

  return withLimit(async () => {
    try {
      if (__DEV__ && Platform.OS === 'ios') {
        console.log('[translate:ios] ========== translateText START ==========');
        console.log('[translate:ios] target=', normalizedTarget, 'source=', sourceLang);
      }
      let viaEdge: TranslateResult | null = null;
      try {
        viaEdge = await translateViaEdgeFunction(sanitized, normalizedTarget, sourceLang, accessToken);
      } catch (e) {
        if (TRANSLATE_DEBUG) console.warn('[translate] Edge function error:', (e as Error)?.message ?? e);
      }
      if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Edge result', viaEdge ? 'OK' : 'fallback/null');
      if (viaEdge && 'text' in viaEdge) {
        const decoded = safeDecodeTranslated(viaEdge.text);
        if (decoded.trim() && decoded.trim() !== sanitized.trim()) {
          setCache(sanitized, normalizedTarget, sourceLang, decoded);
        }
        if (options?.itemId) {
          if (__DEV__ && Platform.OS === 'ios' && !decoded?.trim()) console.error('[translate:ios] ERROR: Result is empty or undefined');
          emitTranslationComplete({ itemId: options.itemId, text: decoded });
        }
        return { text: decoded };
      }

      if (TRANSLATE_DEBUG) console.log('[translate] Edge failed, trying MyMemory');
      const viaMyMemory = await translateViaMyMemory(sanitized, normalizedTarget, sourceLang);
      if (viaMyMemory && 'text' in viaMyMemory) {
        const decoded = safeDecodeTranslated(viaMyMemory.text);
        if (decoded.trim() && decoded.trim() !== sanitized.trim()) {
          setCache(sanitized, normalizedTarget, sourceLang, decoded);
        }
        if (options?.itemId) {
          if (__DEV__ && Platform.OS === 'ios' && !decoded?.trim()) console.error('[translate:ios] ERROR: Result is empty or undefined');
          emitTranslationComplete({ itemId: options.itemId, text: decoded });
        }
        return { text: decoded };
      }

      return { error: 'Translation failed' };
    } catch (e) {
      if (TRANSLATE_DEBUG) console.warn('[translate] Network/other error:', (e as Error)?.message ?? e);
      return { error: 'Translation failed' };
    }
  });
}
