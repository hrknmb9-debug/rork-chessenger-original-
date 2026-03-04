// Supabase Edge Function: 翻訳
// Google Cloud Translation API を使う場合は GOOGLE_TRANSLATE_API_KEY を設定
// 未設定時は MyMemory API をフォールバックで使用

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeLang(lang: string): string {
  const m: Record<string, string> = {
    ja: 'ja', japanese: 'ja', en: 'en', english: 'en',
    zh: 'zh', chinese: 'zh', ko: 'ko', korean: 'ko',
    fr: 'fr', de: 'de', es: 'es', pt: 'pt', ru: 'ru',
    ar: 'ar', hi: 'hi', it: 'it', th: 'th', vi: 'vi', tr: 'tr',
    nl: 'nl', pl: 'pl', sv: 'sv', id: 'id', ms: 'ms', tl: 'tl',
    da: 'da', fi: 'fi', no: 'no', auto: 'auto',
  };
  return m[lang?.toLowerCase()] ?? lang?.slice(0, 2) ?? 'en';
}

async function translateGoogle(text: string, target: string, source: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const body: Record<string, unknown> = { q: [text], target };
    if (source && source !== 'auto') body.source = source;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.translations?.[0]?.translatedText ?? null;
  } catch {
    return null;
  }
}

async function translateMyMemory(text: string, target: string, source: string): Promise<string | null> {
  try {
    const langpair = `${source}|${target}`;
    const encoded = encodeURIComponent(text.slice(0, 500));
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.responseData?.translatedText ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, targetLang, sourceLang } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const target = normalizeLang(targetLang ?? 'en');
    const source = normalizeLang(sourceLang ?? 'auto');
    const apiKey = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
    let translated: string | null = null;
    if (apiKey) {
      translated = await translateGoogle(text, target, source, apiKey);
    }
    if (!translated) {
      translated = await translateMyMemory(text, target, source);
    }
    if (!translated) {
      return new Response(
        JSON.stringify({ error: 'Translation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const decoded = typeof translated === 'string' && /%[0-9A-Fa-f]{2}/.test(translated)
      ? (() => { try { return decodeURIComponent(translated.replace(/\s+/g, '')); } catch { return translated; } })()
      : translated;
    return new Response(
      JSON.stringify({ translatedText: decoded }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
