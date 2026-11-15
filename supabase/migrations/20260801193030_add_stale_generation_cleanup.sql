-- Stale Generation Recovery
--
-- If an edge function is killed mid-execution (timeout, restart, OOM), the
-- generation record stays in an active status forever. This migration:
--   1. Enables pg_cron
--   2. Creates a function that marks generations stuck in active status
--      for more than 30 minutes as failed
--   3. Schedules it to run every 5 minutes

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function to mark stale active generations as failed
CREATE OR REPLACE FUNCTION public.mark_stale_generations_failed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stale_record RECORD;
BEGIN
  FOR stale_record IN
    SELECT id, status
    FROM generations
    WHERE status IN ('queued', 'uploading_assets', 'generating', 'processing', 'downloading', 'storing')
      AND created_at < NOW() - INTERVAL '30 minutes'
  LOOP
    UPDATE generations
    SET status = 'failed',
        failed_at_step = 'timeout',
        error_message = 'Generation exceeded 30 minutes in active status — likely abandoned due to edge function timeout or restart.',
        error_details = jsonb_build_object('previous_status', stale_record.status, 'stale_since', NOW()::text),
        completed_at = NOW()
    WHERE id = stale_record.id;

    INSERT INTO generation_history (generation_id, from_status, to_status, event_description, event_metadata)
    VALUES (
      stale_record.id,
      stale_record.status,
      'failed',
      'Auto-recovery: generation stuck in active status for >30 minutes',
      jsonb_build_object('previous_status', stale_record.status, 'recovered_at', NOW()::text)
    );
  END LOOP;
END;
$$;

-- Schedule the cleanup every 5 minutes.
-- pg_cron runs as the postgres user, which bypasses RLS, so no extra grants needed.
SELECT cron.schedule(
  'mark-stale-generations-failed',
  '*/5 * * * *',
  $$SELECT public.mark_stale_generations_failed();$$
);
