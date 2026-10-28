# Register Watch backend (serverless: Worker + D1, no R2)
Deploy with the "Deploy backend" GitHub workflow (needs repo secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, APP_KEY).
Pictures live in D1: the latest picture, one picture per camera every 30 s (kept 2 days), and theft/blocked alert pictures.
Set each camera to push a small picture (its sub-stream, ~640x360); the limit is 1.4 MB per upload.
Alerts: the phone app's background service polls /api/events. No Firebase, no push service.
