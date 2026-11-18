# Surve / NSurvey — notes for Claude sessions

**Start every session by reading `CONTINUE_HERE.md`.** It has the current status, the open next steps and the known gaps. Update it before you end a session.

- Stack: React 18 + Vite + TS (`src/`), Vercel Node functions (`api/`), Supabase (Auth + Postgres, schema in `supabase/migrations/`), Paystack billing.
- Shared prices: `shared/pricing.ts`. Never trust a price or a plan sent from the client.
- Billing fields on `profiles` can only be changed by `service_role`. Keep it that way.
- Never put secrets in the repo. Server secrets live only in Vercel env vars (see `.env.example`).
- Verify before pushing: `npx tsc --noEmit && npx tsc -p api/tsconfig.json && npm run build`.
- Vercel: team "Glaze Workings", project `surve`. Supabase project ref `emzxnkvolpbrkumgdyib`.
