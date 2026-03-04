-- profiles: auth.users 挿入時に自動でプロファイルを作成し、RLS を整備
-- 1. handle_new_user トリガー: 新規ユーザー作成時に profiles を自動作成（SECURITY DEFINER で RLS をバイパス）
-- 2. profiles RLS ポリシー: 認証済みユーザーが自分のプロファイルを SELECT/INSERT/UPDATE できるようにする

-- 既存の profiles 関連ポリシーを一度削除（重複・競合を避ける）
DROP POLICY IF EXISTS "Allow authenticated users to view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update own profile" ON public.profiles;
DROP POLICY IF EXISTS "user_profiles_policy" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to manage own profile" ON public.profiles;

-- トリガー関数: auth.users への INSERT 直後に profiles を自動作成
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  display_name TEXT;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'username',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'User'
  );
  IF display_name = '' THEN
    display_name := 'User';
  END IF;

  INSERT INTO public.profiles (id, name, email, avatar, rating, games_played, wins, losses, draws, last_seen)
  VALUES (
    NEW.id,
    display_name,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face'),
    0,
    0,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- トリガー: auth.users への INSERT 時に実行
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS を有効化（すでに有効なら何もしない）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: 認証済みユーザーは自分自身のプロファイルを読める
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- INSERT: 認証済みユーザーは id = auth.uid() の行のみ挿入可能（トリガーで作成済みの場合もクライアントからの upsert を許容）
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- UPDATE: 認証済みユーザーは自分自身のプロファイルのみ更新可能
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
