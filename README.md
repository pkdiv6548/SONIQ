# OpenBeat Next v5.1

Responsive frontend music player. It preserves the existing Vercel `/api/search?q=` contract and does not include or replace the working serverless API.

Deploy: upload to GitHub → import into Vercel → keep your existing `/api/search` function → keep `YOUTUBE_API_KEY` in Vercel Environment Variables → redeploy.
