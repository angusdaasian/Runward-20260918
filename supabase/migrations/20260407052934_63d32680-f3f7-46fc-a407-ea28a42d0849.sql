
SELECT cron.schedule(
  'scrape-races-every-3-days',
  '0 3 */3 * *',
  $$
  SELECT
    net.http_post(
        url:='https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/scrape-races',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
