# Register Watch backend (serverless: Worker + D1 + R2)
1. `wrangler d1 create register-watch`, paste the id into wrangler.toml
2. `wrangler d1 execute register-watch --remote --file=schema.sql`
3. `wrangler r2 bucket create register-watch`  (theft pictures and 24-hour recordings live here)
4. `wrangler secret put APP_KEY`  (long random string; the app sends it as a Bearer token)
5. Add repo secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, then run "Deploy backend".
No R2 access keys are needed: the Worker reaches the bucket through its binding.
Recording: one saved picture per camera every 10 s (FRAME_MS) per 24-hour shift. A cron closes shifts.
Alerts: the phone app's background service polls /api/events every 10 s. No Firebase or push service.
