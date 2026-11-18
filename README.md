# NSurvey PRO

Land surveying, COGO, cadastral layout and Title Deed Plan suite (React + Vite + TypeScript), with:

- **Accounts:** Supabase Auth (email/password, confirmation and reset emails)
- **Data:** survey projects stay on the device (IndexedDB). Profiles, organizations and billing records are stored in Supabase Postgres, protected by row-level security
- **Billing:** Paystack checkout. Each payment is verified on the server and through a signed webhook before a plan is granted
- **Offline field licences:** Ed25519-signed by the server and verified offline in the app

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # http://127.0.0.1:3000
```

Without Supabase variables the app still runs. All drafting tools work offline on the free tier, and account features show a "not configured" notice.

## Backend setup (one-time)

1. **Supabase:** create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor.
   Under Authentication → URL Configuration, set the Site URL to your production domain and add it to the Redirect URLs.
2. **Paystack:** under Dashboard → Settings → API Keys & Webhooks, set the webhook URL to
   `https://<your-domain>/api/paystack/webhook`.
3. **Licence keys:** generate an Ed25519 key pair:
   ```bash
   node -e 'const c=require("crypto");const k=c.generateKeyPairSync("ed25519");console.log(k.privateKey.export({type:"pkcs8",format:"pem"}));console.log("PUBLIC:",k.publicKey.export({format:"jwk"}).x)'
   ```
   The private PEM goes into `LICENSE_PRIVATE_KEY`. The public value goes into `VITE_LICENSE_PUBLIC_KEY`, or replaces the default in `subscriptionEngine.ts`.
4. **Vercel environment variables:** see `.env.example`. Variables prefixed `VITE_` are public. `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` and `LICENSE_PRIVATE_KEY` are server-only secrets.

`GET /api/health` reports which server settings are present.

## Deploy

Vercel builds this repo directly: Vite builds the static app and the `api/` folder becomes serverless functions. Security headers, the CSP and the SPA rewrites are in `vercel.json`.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/paystack/initialize` | Prices the chosen plan on the server, records a pending transaction, returns the Paystack checkout URL |
| `POST /api/paystack/verify` | Called when the user returns from Paystack. Verifies the payment with Paystack and upgrades the account |
| `POST /api/paystack/webhook` | Paystack `charge.success` events (HMAC-SHA512 verified) |
| `POST /api/license/issue` | Issues a ≤30-day signed offline licence for an active paid plan |
| `GET /api/health` | Configuration check |

## Desktop

`npm run desktop:dev` / `desktop:build` (Tauri) still work. Set the same `VITE_*` variables at build time.
