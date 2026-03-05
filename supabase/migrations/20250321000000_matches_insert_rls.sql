-- matches: 認証ユーザーが自分を requester とする対局リクエストを INSERT 可能にする
-- ハート押下で sendMatchRequest が成功するために必要

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_insert_requester"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND requester_id = (SELECT auth.uid())
);
