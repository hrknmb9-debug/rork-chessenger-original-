/**
 * テキスト翻訳ユーティリティ
 * Supabase Edge Function または MyMemory 無料API を使用
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type TranslateResult = { text: string } | { error: string };

/** 言語コード (ISO 639-1) */
function normalizeLang(lang: string): string {
  const map: Record<string, string> = { ja: 'ja', en: 'en', japanese: 'ja', english: 'en' };
  return map[lang?.toLowerCase()] ?? (lang?.slice(0, 2) ?? 'en');
}

/** 端末言語から翻訳先言語を決定（自国語へ） */
export function getTargetLanguage(preferredLang?: string): string {
  // アプリの language が ja/en のいずれか
  const lang = preferredLang ?? 'ja';
  return normalizeLang(lang);
}

/** 翻訳元言語を推定（日本語⇔英語の自動判定） */
function detectSourceLang(text: string): string {
  const jaRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  return jaRegex.test(text) ? 'ja' : 'en';
}

/**
 * Supabase Edge Function で翻訳を試行
 */
async function translateViaEdgeFunction(
  text: string,
  targetLang: string,
  sourceLang: string,
  accessToken?: string | null
): Promise<TranslateResult | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url = `${SUPABASE_URL}/functions/v1/translate`;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, targetLang, sourceLang }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.translatedText) return { text: data.translatedText };
    return null;
  } catch {
    return null;
  }
}

/**
 * MyMemory 無料API（バックアップ）
 * https://mymemory.translated.net/doc/spec.php
 */
async function translateViaMyMemory(text: string, targetLang: string, sourceLang: string): Promise<TranslateResult | null> {
  if (sourceLang === targetLang) return { text };
  try {
    const langpair = `${sourceLang}|${targetLang}`;
    const encoded = encodeURIComponent(text.slice(0, 500)); // 500文字制限
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated) return { text: translated };
    return null;
  } catch {
    return null;
  }
}

/**
 * テキストを翻訳する
 * @param text 翻訳するテキスト
 * @param targetLang 翻訳先言語 (ja|en)
 * @param accessToken 認証トークン（Edge Function 用、任意）
 */
export async function translateText(
  text: string,
  targetLang: string,
  accessToken?: string | null
): Promise<TranslateResult> {
  if (!text?.trim()) return { error: 'Empty text' };
  const normalizedTarget = normalizeLang(targetLang);
  const sourceLang = detectSourceLang(text);
  if (sourceLang === normalizedTarget) return { text };

  const viaEdge = await translateViaEdgeFunction(text, normalizedTarget, sourceLang, accessToken);
  if (viaEdge && 'text' in viaEdge) return viaEdge;

  const viaMyMemory = await translateViaMyMemory(text, normalizedTarget, sourceLang);
  if (viaMyMemory && 'text' in viaMyMemory) return viaMyMemory;

  return { error: 'Translation failed' };
}
