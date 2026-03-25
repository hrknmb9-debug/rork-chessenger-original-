-- イベントの募集締め切り日時と手動締め切り用カラム
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.events.deadline_at IS '募集締め切り日時（過ぎると参加不可）';
COMMENT ON COLUMN public.events.closed_at IS '手動で締め切った日時（設定時は参加不可）';
