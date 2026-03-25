-- profiles: 認証済み・anon が他ユーザーのプロファイルを読めるようにする
-- 探すページ・メッセージ一覧で他ユーザー表示に必要

-- 既存の profiles_select_own を削除し、全件読めるポリシーに置き換え
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

-- 認証済みユーザーは全プロファイルを読める（プレイヤー検索・メッセージ相手表示用）
DROP POLICY IF EXISTS "profiles_select_authenticated_all" ON public.profiles;
CREATE POLICY "profiles_select_authenticated_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- anon も全プロファイルを読める（未ログイン時の探すページ表示用）
DROP POLICY IF EXISTS "profiles_select_anon_all" ON public.profiles;
CREATE POLICY "profiles_select_anon_all"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);
