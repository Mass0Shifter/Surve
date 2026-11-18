# CONTINUE HERE — NSurvey (Surve) progress report & resume point

_Last updated: 18 Nov 2026, end of session 1 (Claude). Read this first, then pick up at **§4 Next steps**._

## 1. Where things stand

| Area | Status |
| --- | --- |
| Code review and production hardening | ✅ Done. Branch `production-hardening`, PR #1 → `master` (not merged yet) |
| Vercel hosting | ✅ Project `surve` in team **Glaze Workings** (`prj_oZqu6r2dH4dX69uHHkiL4RUCtJNG`). Live at https://surve-eta.vercel.app, deployed from `production-hardening` |
| Supabase project | ✅ Created: **nsurvey**, ref `emzxnkvolpbrkumgdyib`, region eu-west-2 (London), org "Nacham Tech Org". URL `https://emzxnkvolpbrkumgdyib.supabase.co` |
| Database schema | ⚠️ **NOT APPLIED YET.** The `apply_migration` call waited for the user to confirm and timed out. Re-run it (see §4.1) |
| Vercel env vars set | ✅ `VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), `APP_URL`, `LICENSE_PRIVATE_KEY` (sensitive), `VITE_LICENSE_PUBLIC_KEY` |
| Vercel env vars still missing | ❌ `SUPABASE_SERVICE_ROLE_KEY`, ❌ `PAYSTACK_SECRET_KEY`. The user adds both in the Vercel dashboard. They are secrets, so never ask for them in chat |
| Paystack webhook | ❌ Not configured yet (see §4.4) |

Check server config at any time: `GET https://surve-eta.vercel.app/api/health` → `{"configured":{"supabase":…,"paystack":…,"license":…}}`.
At the end of session 1 it returned `supabase:false, paystack:false, license:true`.

## 2. What the original app had wrong (found in review)

- **Auth was fake.** `loginUser` never checked the password, so any password worked for any registered email. Users lived in `localStorage`.
- **Billing was fake.** A checkout form collected card number, expiry and CVV in the browser, then marked the payment `SUCCESS` and granted Professional without charging.
- **Offline licences could be forged.** The "secret" (`NSURVEY_SECRET_2026`) and a 32-bit hash sat in the client bundle.
- **Demo data that could mislead.** There were "Quick Demo Login" buttons for fictitious surveyors with a fake SURCON seal and registration number. Hard-coded defaults could print a real-looking firm name, allottee and R-of-O number on Title Deed Plans.
- **Organizations were localStorage-only.** "Inviting" a member just created a fake local user id.
- Other issues: a 1.44 MB single JS bundle, the Google tile URL (not permitted by Google's ToS), KML export without XML escaping, a critical DOMPurify CVE and high Vite CVEs, and no deployment config or security headers.

## 3. What was built (commit `893ab5b` + follow-ups on `production-hardening`)

**Backend**
- `supabase/migrations/0001_init.sql` creates the tables `profiles`, `organizations`, `organization_members` and `payment_transactions`, all with RLS:
  - A trigger stops users from changing their own billing fields; only `service_role` can.
  - All org writes go through `security definer` RPCs (`create_organization`, `invite_org_member`, `remove_org_member`, `update_org_member_role`, `update_organization`, `claim_org_invites`, `org_seat_limit_for_member`).
  - The `handle_new_user` trigger creates the profile on signup and claims pending invites.
- `api/` holds the Vercel Node functions. Shared helpers are in `api/_lib/`.
  - `paystack/initialize` (prices the plan on the server), `paystack/verify`, `paystack/webhook` (HMAC-SHA512)
  - `license/issue` (Ed25519 signing)
  - `health`
- `shared/pricing.ts` is the single source of plan prices, used by both the app and the API.

**Frontend**
- `src/lib/supabase.ts` holds the client, `apiFetch` (sends the bearer token) and `friendlyError`.
- `src/engine/auth/authEngine.ts` was rewritten on Supabase Auth with the same exported API, plus `initAuth`, `refreshCurrentUser`, `setNewPassword` and `onPasswordRecovery`.
- `src/engine/organization/orgEngine.ts` reads from an in-memory cache filled by `refreshOrganizations` and writes through the RPCs.
- `src/engine/subscription/subscriptionEngine.ts` provides `startCheckout` (redirects to Paystack), `confirmCheckout` (on return via `?payment_ref=`), `fetchTransactionHistory`, and `requestOfflineLicense` / `activateOfflineLicense` / `loadOfflineLicense` (verified with `@noble/ed25519`).
- In `featureGating.ts`, `effectiveTier()` combines the server plan with a valid offline licence.
- AuthModal: demo logins removed, email-confirmation flow, a "recovery" tab for setting a new password.
- SubscriptionStudioModal: the card form is gone. It now has a Paystack redirect checkout, a real history and the signed-licence UI.
- `src/lib/lazyModal.tsx`: all 23 dialogs/studios are code-split, and a stale chunk after a redeploy triggers an auto-reload.
- `vercel.json`: CSP, HSTS, security headers, SPA rewrite, immutable asset cache, functions pinned to region `lhr1`.

**Offline licence keys:** the public key is `bQg5lo-3FKShMEsvNV2qa9kJ2XP_YtJsaHfMluPdQsM`. It is hard-coded as the default in `subscriptionEngine.ts` and also set as an env var. The private key is set only in Vercel (`LICENSE_PRIVATE_KEY`). To rotate, generate a new pair (command in README), update both, and redeploy. Old licences then stop verifying.

## 4. Next steps (do these in order)

1. **Apply the schema.** Run `supabase/migrations/0001_init.sql` on project `emzxnkvolpbrkumgdyib`, either with the Supabase MCP tool `apply_migration` (name `init_nsurvey`; the user must approve the prompt) or by pasting it into the SQL editor. Then run `get_advisors` (security) and fix anything it flags.
2. **The user adds the secrets in Vercel** (Project `surve` → Settings → Environment Variables, Production + Preview):
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → **secret** key (`sb_secret_…`) or the legacy `service_role` JWT
   - `PAYSTACK_SECRET_KEY`: `sk_test_…` first, `sk_live_…` when going live
3. **Supabase Auth settings** (Dashboard → Authentication → URL Configuration): Site URL `https://surve-eta.vercel.app` (or the custom domain), and add it under Redirect URLs. Consider custom SMTP so confirmation and reset emails don't hit the free-tier rate limit.
4. **Paystack webhook:** Dashboard → Settings → API Keys & Webhooks → `https://surve-eta.vercel.app/api/paystack/webhook`.
5. **Redeploy** (VITE_ vars are baked in at build time), then check `/api/health` shows all `true`.
6. **End-to-end test on the live site**: sign up → confirm email → sign in → edit profile → Plans → pay with a Paystack **test** card → return → plan active → create an org → invite a second email → sign in as that user → appears as member → Offline licence: get one → paste on another browser → tools unlocked → password reset email flow.
7. **Merge PR #1** into `master`. Vercel's production branch is `master`, so pushes there deploy production. Optionally add a custom domain (e.g. `nsurvey.nachamtns.com`).

## 5. Known gaps / future work

- **Survey projects are still device-local** (IndexedDB, `src/engine/storage/projectDatabase.ts`). An org's "shared library" doesn't sync between members' devices. Next big feature: a `projects` table with RLS by owner/org, plus sync.
- Seals, signatures and firm logos are stored as data URLs in Postgres text columns (≤512 KB enforced in the UI). Moving them to Supabase Storage would be better.
- No auto-renew: plans are one-off payments for 30 or 365 days. Paystack Subscriptions/Plans could add recurring billing, and expiry reminder emails aren't built yet.
- Prices are NGN only. The USD figures in `shared/pricing.ts` are informational.
- Feature gating runs client-side, as in any SPA. Server-enforced items are billing, orgs/seats and licence issuing.
- There is no automated test suite yet. Adding Vitest for `engine/*` (COGO, traverse, datum maths) would be worthwhile.
- `npm audit` shows one low dev-only `esbuild` advisory (Windows dev server).
- Tauri/Electron desktop builds need the same `VITE_*` vars at build time. Not tested this session.

## 6. Handy commands

```bash
npm ci && npm run dev                # local (needs .env.local, see .env.example)
npx tsc --noEmit                     # type-check app
npx tsc -p api/tsconfig.json         # type-check serverless functions
npm run build                        # production build
```
