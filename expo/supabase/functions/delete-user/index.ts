// Supabase Edge Function: アカウント削除
// 認証済みユーザーが自身のアカウントを削除する（Apple App Store 審査対応）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization' }),
        { status: 401, headers: { ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const supabaseAnon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders } }
      );
    }

    const userId = user.id;

    const db = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ── 依存データを FK 制約の順に削除 ────────────────────────────────────

    // ブロック（双方向）
    await db.from('blocks').delete().eq('blocker_id', userId);
    await db.from('blocks').delete().eq('blocked_id', userId);

    // 通報（双方向）
    await db.from('reports').delete().eq('reporter_id', userId);
    await db.from('reports').delete().eq('reported_id', userId);

    // マッチ結果報告（双方向）
    await db.from('match_result_reports').delete().eq('reporter_id', userId);
    await db.from('match_result_reports').delete().eq('opponent_id', userId);

    // マッチ評価
    await db.from('match_ratings').delete().eq('rater_id', userId);

    // ユーザーが参加したマッチの room_id を取得してからメッセージを削除
    const { data: userMatches } = await db
      .from('matches')
      .select('id')
      .or(`requester_id.eq.${userId},opponent_id.eq.${userId},winner_id.eq.${userId}`);

    if (userMatches?.length) {
      const matchIds = userMatches.map((m: { id: string }) => m.id);
      // そのマッチルームの全メッセージを削除（送受信問わず）
      await db.from('messages').delete().in('room_id', matchIds);
      // マッチ評価（match_id 経由）
      await db.from('match_ratings').delete().in('match_id', matchIds);
      // マッチ結果報告（match_id 経由）
      await db.from('match_result_reports').delete().in('match_id', matchIds);
    }

    // 送信者としてのメッセージ（room に含まれなかった分）
    await db.from('messages').delete().eq('sender_id', userId);

    // マッチ本体（requester / opponent / winner すべて）
    await db.from('matches').delete().eq('requester_id', userId);
    await db.from('matches').delete().eq('opponent_id', userId);
    await db.from('matches').delete().eq('winner_id', userId);

    // お気に入り（双方向）
    try {
      await db.from('player_favorites').delete().eq('user_id', userId);
      await db.from('player_favorites').delete().eq('favorite_player_id', userId);
    } catch (_) { /* テーブルが存在しない場合は無視 */ }

    // イベント参加
    await db.from('event_participants').delete().eq('user_id', userId);

    // 投稿への いいね / コメント
    await db.from('post_likes').delete().eq('user_id', userId);
    await db.from('comments').delete().eq('user_id', userId);

    // 通知（送受信）
    await db.from('notifications').delete().eq('user_id', userId);
    // related_id で参照されている通知（カラムが存在する場合のみ）
    try {
      await db.from('notifications').delete().eq('related_user_id', userId);
    } catch (_) { /* カラムが存在しない場合は無視 */ }

    // 自分の投稿に紐づくサブリソースを消してから投稿本体を削除
    const { data: userPosts } = await db.from('posts').select('id').eq('user_id', userId);
    if (userPosts?.length) {
      const postIds = userPosts.map((p: { id: string }) => p.id);
      await db.from('post_likes').delete().in('post_id', postIds);
      await db.from('comments').delete().in('post_id', postIds);
      const { data: ev } = await db.from('events').select('id').in('post_id', postIds);
      if (ev?.length) {
        const evIds = ev.map((e: { id: string }) => e.id);
        await db.from('event_participants').delete().in('event_id', evIds);
        await db.from('events').delete().in('post_id', postIds);
      }
      await db.from('posts').delete().eq('user_id', userId);
    }

    // プロフィール
    await db.from('profiles').delete().eq('id', userId);

    // ── auth.users から削除 ────────────────────────────────────────────────
    const { error: deleteError } = await supabaseAuth.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('delete-user: admin.deleteUser failed', deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message || 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders } }
    );
  } catch (e) {
    console.error('delete-user: unexpected error', e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders } }
    );
  }
});
