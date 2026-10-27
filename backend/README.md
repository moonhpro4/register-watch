# Register Watch backend
1. `wrangler d1 create register-watch` and paste the id into wrangler.toml
2. `wrangler d1 execute register-watch --remote --file=schema.sql`
3. `wrangler r2 bucket create register-watch`
4. `wrangler secret put APP_KEY` (a long random string the mobile app will send as a Bearer token)
5. Push to GitHub. Add repo secrets CLOUDFLARE_API_TOKEN (scoped: Workers, D1, R2, AI) and CLOUDFLARE_ACCOUNT_ID.
