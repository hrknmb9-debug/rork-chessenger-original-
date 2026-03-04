/**
 * テキスト翻訳ユーティリティ
 * Supabase Edge Function または MyMemory 無料API を使用
 * 翻訳結果は AsyncStorage にキャッシュし API クォータを節約
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabaseClient';

const TRANSLATE_CACHE_KEY = 'chess_translate_cache';
const CACHE_MAX_ENTRIES = 500;
const CACHE_VERSION = 2;

export type TranslateResult = { text: string } | { error: string };

/** URLエンコードされた翻訳結果をデコード（文字化け対策） */
function safeDecodeTranslated(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
      const withoutSpaces = trimmed.replace(/\s+/g, '');
      const decoded = decodeURIComponent(withoutSpaces);
      if (decoded && decoded.length > 0 && !/%[0-9A-Fa-f]{2}/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // デコード失敗時は元の文字列を返す
  }
  return text;
}

/** 言語コード正規化 (ISO 639-1) */
function normalizeLang(lang: string): string {
  const map: Record<string, string> = {
    ja: 'ja', japanese: 'ja',
    en: 'en', english: 'en',
    zh: 'zh', chinese: 'zh',
    ko: 'ko', korean: 'ko',
    fr: 'fr', french: 'fr',
    de: 'de', german: 'de',
    es: 'es', spanish: 'es',
    pt: 'pt', portuguese: 'pt',
    ru: 'ru', russian: 'ru',
    ar: 'ar', arabic: 'ar',
    hi: 'hi', hindi: 'hi',
    it: 'it', th: 'th', vi: 'vi', tr: 'tr', nl: 'nl', pl: 'pl', sv: 'sv',
    id: 'id', ms: 'ms', tl: 'tl', da: 'da', fi: 'fi', no: 'no',
  };
  return map[lang?.toLowerCase()] ?? (lang?.slice(0, 2) ?? 'en');
}

/** 設定言語から翻訳先言語を決定 */
export function getTargetLanguage(preferredLang?: string): string {
  const lang = preferredLang ?? 'ja';
  return normalizeLang(lang);
}

/** 翻訳元言語を推定（日本語・中国語・韓国語等の自動判定） */
function detectSourceLang(text: string): string {
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F]/.test(text)) return 'zh';
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase Edge Function で翻訳を試行
 * 1. supabase.functions.invoke（認証トークン自動付与）
 * 2. 失敗時は直接 fetch で再試行（CORS・ネットワーク問題の回避）
 */
async function translateViaEdgeFunction(
  text: string,
  targetLang: string,
  sourceLang: string,
  accessToken?: string | null
): Promise<TranslateResult | null> {
  // 1. invoke で試行
  try {
    const { data, error } = await supabase.functions.invoke('translate', {
      body: { text, targetLang, sourceLang },
    });
    if (!error) {
      const raw = data?.translatedText ?? data?.text;
      if (raw && typeof raw === 'string') {
        return { text: safeDecodeTranslated(raw) };
      }
    }
  } catch {
    // フォールバックへ
  }

  // 2. 直接 fetch で再試行（invoke 失敗時の保険）
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, targetLang, sourceLang }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.translatedText ?? data?.text;
        if (raw && typeof raw === 'string') {
          return { text: safeDecodeTranslated(raw) };
        }
      }
    } catch {
      // MyMemory フォールバックへ
    }
  }
  return null;
}

/**
 * MyMemory 無料API（バックアップ）
 */
async function translateViaMyMemory(text: string, targetLang: string, sourceLang: string): Promise<TranslateResult | null> {
  if (sourceLang === targetLang) return { text };
  try {
    const langpair = `${sourceLang}|${targetLang}`;
    const encoded = encodeURIComponent(text.slice(0, 500));
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.responseData?.translatedText;
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
  _accessToken?: string | null
): Promise<TranslateResult> {
  if (!text?.trim()) return { error: 'Empty text' };
  const normalizedTarget = normalizeLang(targetLang);
  const sourceLang = detectSourceLang(text);
  if (sourceLang === normalizedTarget) return { text };

  const cached = await getCached(text, normalizedTarget, sourceLang);
  if (cached) return { text: safeDecodeTranslated(cached) };

  const viaEdge = await translateViaEdgeFunction(text, normalizedTarget, sourceLang, _accessToken);
  if (viaEdge && 'text' in viaEdge) {
    const decoded = safeDecodeTranslated(viaEdge.text);
    setCache(text, normalizedTarget, sourceLang, decoded);
    return { text: decoded };
  }

  const viaMyMemory = await translateViaMyMemory(text, normalizedTarget, sourceLang);
  if (viaMyMemory && 'text' in viaMyMemory) {
    const decoded = safeDecodeTranslated(viaMyMemory.text);
    setCache(text, normalizedTarget, sourceLang, decoded);
    return { text: decoded };
  }

  return { error: 'Translation failed' };
}
