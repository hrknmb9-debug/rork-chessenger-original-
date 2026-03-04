// Supabase Edge Function: 翻訳
// Google Cloud Translation API を使う場合は GOOGLE_TRANSLATE_API_KEY を設定
// 未設定時は MyMemory API をフォールバックで使用

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400', // iOS: プリフライトの頻繁な送信を抑制
  'Content-Type': 'application/json; charset=utf-8', // iOS 絵文字・特殊文字の文字化け防止
};

function normalizeLang(lang: string): string {
  const m: Record<string, string> = {
    en: 'en', zh: 'zh', hi: 'hi', es: 'es', ar: 'ar', fr: 'fr',
    bn: 'bn', pt: 'pt', ru: 'ru', id: 'id', ja: 'ja', ko: 'ko',
    auto: 'auto',
  };
  return m[lang?.toLowerCase()] ?? lang?.slice(0, 2) ?? 'en';
}

async function translateGoogle(text: string, target: string, source: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const body: Record<string, unknown> = { q: [text], target, format: 'text' };
    if (source && source !== 'auto') body.source = source;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json; charset=utf-8' },
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
    const body = await req.json();
    const text = body?.text;
    const targetLang = body?.targetLang;
    const sourceLang = body?.sourceLang;
    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing text' }),
        { status: 400, headers: { ...corsHeaders } }
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
        { status: 500, headers: { ...corsHeaders } }
      );
    }
    // 文字化け対策: URLエンコード（スペース混入含む）を必ずデコード
    let output = translated;
    if (typeof output === 'string' && (/%[0-9A-Fa-f]{2}/.test(output) || /%\s*[0-9A-Fa-f]/.test(output))) {
      try {
        const compact = output.replace(/\s+/g, '');
        let decoded = decodeURIComponent(compact);
        if (decoded && /%[0-9A-Fa-f]{2}/.test(decoded)) {
          try {
            decoded = decodeURIComponent(decoded);
          } catch {
            /* 二重デコード失敗時は1回目を使用 */
          }
        }
        if (decoded && decoded.length > 0) output = decoded;
      } catch {
        /* デコード失敗時は元の文字列を使用 */
      }
    }
    // Base64バイパス: iOSネットワーク層の文字コード改変を完全回避
    const encoder = new TextEncoder();
    const bytes = encoder.encode(output);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const translatedTextBase64 = btoa(binary);
    const responseBody = JSON.stringify({ translatedTextBase64, translatedText: output });
    return new Response(responseBody, {
      headers: { ...corsHeaders },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders } }
    );
  }
});
