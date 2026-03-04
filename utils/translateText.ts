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

/** 言語コード正規化 (ISO 639-1) */
function normalizeLang(lang: string): string {
  const map: Record<string, string> = {
    en: 'en', english: 'en',
    zh: 'zh', chinese: 'zh',
    hi: 'hi', hindi: 'hi',
    es: 'es', spanish: 'es',
    ar: 'ar', arabic: 'ar',
    fr: 'fr', french: 'fr',
    bn: 'bn', bengali: 'bn',
    pt: 'pt', portuguese: 'pt',
    ru: 'ru', russian: 'ru',
    id: 'id', indonesian: 'id',
    ja: 'ja', japanese: 'ja',
    ko: 'ko', korean: 'ko',
  };
  return map[lang?.toLowerCase()] ?? (lang?.slice(0, 2) ?? 'en');
}

/** 設定言語から翻訳先言語を決定 */
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
      if (xhr.status >= 200 && xhr.status < 300) {
        const raw = xhr.responseText ?? xhr.response;
        if (typeof raw === 'string' && raw.trim()) {
          try {
            resolve(JSON.parse(raw.trim()) as Record<string, unknown>);
          } catch (e) {
            if (TRANSLATE_DEBUG) console.warn('[translate] XHR JSON parse failed:', e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      } else {
        if (TRANSLATE_DEBUG) console.warn('[translate] XHR status', xhr.status);
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
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (TRANSLATE_DEBUG) console.log('[translate] POST', url, 'target:', targetLang, 'len:', text.length);

    if (Platform.OS !== 'web') {
      // RN iOS/Android: XHR responseType 'text' で確実に取得
      let data = await fetchJsonViaXHR(url, { method: 'POST', headers, body: bodyStr });
      if (!data) {
        // フォールバック: fetch + res.json()（内部処理が異なる場合がある）
        try {
          const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
          if (res.ok) data = await res.json();
        } catch (e) {
          if (TRANSLATE_DEBUG) console.warn('[translate] fetch fallback failed:', e);
        }
      }
      if (!data) {
        if (TRANSLATE_DEBUG) console.warn('[translate] empty or invalid response');
        return null;
      }
      const err = data.error as string | undefined;
      if (err) {
        if (TRANSLATE_DEBUG) console.warn('[translate] API error:', err);
        return null;
      }
      const raw = (data.translatedText ?? data.text) as string | undefined;
      if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
      return null;
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
      const data = await parseJsonFromFetchResponse(res);
      if (!data) {
        if (TRANSLATE_DEBUG) console.warn('[translate] Empty or invalid response');
        return null;
      }
      const err = data.error as string | undefined;
      if (err) {
        if (TRANSLATE_DEBUG) console.warn('[translate] API error:', err);
        return null;
      }
      const raw = (data.translatedText ?? data.text) as string | undefined;
      if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
      return null;
    } catch (e) {
      if (TRANSLATE_DEBUG) console.warn('[translate] fetch failed:', e);
      return null;
    }
  };

  // iOS: invoke は Supabase クライアント内部の fetch を使い、RN の res.text 不具合を避けられないためスキップ
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

  if (Platform.OS !== 'web') {
    let data = await fetchJsonViaXHR(url, { method: 'GET' });
    if (!data) {
      try {
        const res = await fetch(url);
        if (res.ok) data = await res.json();
      } catch {
        /* ignore */
      }
    }
    if (!data) return null;
    const raw = data?.responseData?.translatedText as string | undefined;
    if (raw && typeof raw === 'string') return { text: safeDecodeTranslated(raw) };
    return null;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await parseJsonFromFetchResponse(res);
    if (!data) return null;
    const raw = data?.responseData?.translatedText as string | undefined;
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
    const viaEdge = await translateViaEdgeFunction(text, normalizedTarget, sourceLang, accessToken);
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
