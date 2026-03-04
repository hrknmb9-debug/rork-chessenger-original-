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

/** iOS 同時接続制限対応: 並列翻訳を最大 CONCURRENT_TRANSLATE に制限 */
const CONCURRENT_TRANSLATE = 4;
let activeCount = 0;
const waiting: Array<() => void> = [];

async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (activeCount >= CONCURRENT_TRANSLATE) {
    await new Promise<void>(resolve => { waiting.push(resolve); });
  }
  activeCount++;
  try {
    return await fn();
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

/**
 * XHR で responseType: 'text' を使用して JSON 取得
 * iOS: arraybuffer が undefined になる場合があるため、text が確実
 */
function fetchJsonViaXHRText(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? 'GET', url, true);
    xhr.responseType = 'text'; // text は RN iOS で確実に動作
    xhr.timeout = 30000;
    const headers = options.headers ?? {};
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.onload = () => {
      const status = xhr.status;
      const raw = xhr.responseText ?? xhr.response;
      if (__DEV__ && Platform.OS === 'ios') {
        console.log('[translate:ios] XHR onload status=', status);
        console.log('[translate:ios] XHR raw response (preview):', typeof raw === 'string' ? raw.slice(0, 200) + (raw.length > 200 ? '...' : '') : String(raw));
      }
      if (status >= 200 && status < 300) {
        if (typeof raw === 'string' && raw.trim()) {
          try {
            const text = raw.trim();
            const parsed = JSON.parse(text) as Record<string, unknown>;
            if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] JSON parse OK');
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
      if (TRANSLATE_DEBUG) console.warn('[translate] XHR timeout');
      resolve(null);
    };
    xhr.send(options.body ?? null);
  });
}

/** RN iOS/Android 用: XHR responseType 'text' で JSON 取得（arraybuffer は iOS で未実装のため） */
const fetchJsonViaXHR = fetchJsonViaXHRText;

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
  const token = accessToken ?? SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (TRANSLATE_DEBUG) console.warn('[translate] Missing SUPABASE_URL or ANON_KEY');
    return null;
  }

  const doFetch = async (): Promise<TranslateResult | null> => {
    const url = `${SUPABASE_URL}/functions/v1/translate`;
    const bodyStr = JSON.stringify({ text, targetLang, sourceLang });
    const headers: Record<string, string> = {
      'Accept': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
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
        // フォールバック: fetch + res.text()（response.json() は使わない）
        try {
          const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
          if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Fetch fallback status=', res.status);
          const rawText = await res.text();
          if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Fetch fallback raw (preview):', rawText?.slice(0, 200) ?? '');
          if (res.ok && rawText?.trim()) {
            try {
              data = JSON.parse(rawText.trim()) as Record<string, unknown>;
              if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Fetch fallback JSON parse OK');
            } catch (pe) {
              if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] Fetch fallback parse failed:', pe);
            }
          }
        } catch (e) {
          if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] Fetch fallback error:', e);
        }
      }
      if (!data) {
        if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] empty/invalid response → fallback to original text');
        return { text }; // 可能性1フォールバック: JSON壊れ時は元テキストを返す
      }
      const err = data.error as string | undefined;
      if (err) {
        if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] API error:', err);
        return { text }; // フォールバック: 元テキスト
      }
      const raw = (data.translatedText ?? data.text) as string | undefined;
      if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
      if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] no translatedText field → fallback');
      return { text };
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
      // Web: res.text() + JSON.parse でバイナリ混入を排除（二段構えバリデーション）
      const rawText = await res.text();
      let data: Record<string, unknown> | null = null;
      if (rawText?.trim()) {
        try {
          data = JSON.parse(rawText.trim()) as Record<string, unknown>;
        } catch (e) {
          if (TRANSLATE_DEBUG) console.warn('[translate] Web JSON parse failed:', e);
        }
      }
      if (!data) {
        if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] Web path empty response → fallback');
        return { text };
      }
      const err = data.error as string | undefined;
      if (err) {
        if (TRANSLATE_DEBUG) console.warn('[translate] API error:', err);
        return { text };
      }
      const raw = (data.translatedText ?? data.text) as string | undefined;
      if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
      return { text };
    } catch (e) {
      if (__DEV__ && Platform.OS === 'ios') console.warn('[translate:ios] fetch failed:', e);
      return { text };
    }
  };

  // 可能性4: iOS では invoke をスキップして doFetch を直接使用（invoke 前後でログは doFetch 内で出力）
  if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Skip supabase.functions.invoke, using direct fetch/XHR');
  if (Platform.OS !== 'ios') {
    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { text, targetLang, sourceLang },
      });
      if (TRANSLATE_DEBUG && error) console.warn('[translate] invoke error:', error?.message ?? error);
      if (!error) {
        const raw = data?.translatedText ?? data?.text;
        if (raw && typeof raw === 'string') {
          return { text: safeDecodeTranslated(raw) };
        }
      }
    } catch (e) {
      if (TRANSLATE_DEBUG) console.warn('[translate] invoke exception:', e);
    }
  }

  const result = await doFetch();
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
  const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;

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
  accessToken?: string | null
): Promise<TranslateResult> {
  const normalizedTarget = normalizeLang(targetLang);
  const sourceLang = detectSourceLang(text);
  if (!text?.trim()) return { error: 'Empty text' };
  if (sourceLang === normalizedTarget) {
    if (TRANSLATE_DEBUG) console.log('[translate] Skip: source===target', normalizedTarget);
    return { text };
  }

  const cached = await getCached(text, normalizedTarget, sourceLang);
  if (cached) return { text: safeDecodeTranslated(cached) };

  return withLimit(async () => {
    if (__DEV__ && Platform.OS === 'ios') {
      console.log('[translate:ios] ========== translateText START ==========');
      console.log('[translate:ios] target=', normalizedTarget, 'source=', sourceLang);
    }
    const viaEdge = await translateViaEdgeFunction(text, normalizedTarget, sourceLang, accessToken);
    if (__DEV__ && Platform.OS === 'ios') console.log('[translate:ios] Edge result', viaEdge ? 'OK' : 'fallback/null');
    if (viaEdge && 'text' in viaEdge) {
      const decoded = safeDecodeTranslated(viaEdge.text);
      if (decoded.trim() && decoded.trim() !== text.trim()) {
        setCache(text, normalizedTarget, sourceLang, decoded);
      }
      return { text: decoded };
    }

    if (TRANSLATE_DEBUG) console.log('[translate] Edge failed, trying MyMemory');
    const viaMyMemory = await translateViaMyMemory(text, normalizedTarget, sourceLang);
    if (viaMyMemory && 'text' in viaMyMemory) {
      const decoded = safeDecodeTranslated(viaMyMemory.text);
      if (decoded.trim() && decoded.trim() !== text.trim()) {
        setCache(text, normalizedTarget, sourceLang, decoded);
      }
      return { text: decoded };
    }

    return { error: 'Translation failed' };
  });
}
