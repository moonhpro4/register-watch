# Register Watch backend (all serverless)
1. `wrangler d1 create register-watch`, paste the id into wrangler.toml
2. `wrangler d1 execute register-watch --remote --file=schema.sql`
3. `wrangler r2 bucket create register-watch`
4. `wrangler secret put APP_KEY`  (long random string; the app sends it as a Bearer token)
5. Push alerts: in Firebase console create a project, add an Android app with package `com.registerwatch.app`,
   download `google-services.json` (app) and a service-account key (Project settings > Service accounts > Generate key).
   Then: `wrangler secret put FCM_SA < service-account.json`
6. Add GitHub repo secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOGLE_SERVICES_JSON (the file's contents). Run "Deploy backend".
Recording: each camera keeps one saved picture every 10 s (FRAME_MS) per 24-hour shift in R2. A cron closes shifts and sends the push.
