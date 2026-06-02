-- Additieve kolom om records-sync van logged-time-sync rijen te onderscheiden in sync_logs.
-- REEDS TOEGEPAST OP LIVE via MCP (2026-06-02).
-- Nodig voor zuivere per-dag missed-days-detectie en persistent-failure-alerting in sync.js
-- (scripts/basicall-sync/sync.js). Bestaande rijen blijven NULL en worden door
-- getMissedDays/maybeAlertPersistentFailure als 'records-of-legacy' behandeld
-- ('kind IS NULL OR kind = records'), zodat de eerste deploy geen backfill-storm geeft.
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS kind text;
COMMENT ON COLUMN public.sync_logs.kind IS 'records | logged_time — onderscheidt sync-soort voor gap-detectie/alerting';
