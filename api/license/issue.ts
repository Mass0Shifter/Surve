import { createPrivateKey, sign } from 'node:crypto';
import { allowMethods, env, handle, HttpError, jsonBody, requireUser, send, supabaseAdmin } from '../_lib/server.js';
import { isPaidTier, LICENSE_PREFIX, OfflineLicenseClaims } from '../../shared/pricing.js';

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * POST { days } → { token } — issues a signed offline field licence (max 30 days,
 * never beyond the paid subscription's expiry). Signed with Ed25519; the app
 * verifies it with the public key only.
 */
export default handle(async (req, res) => {
  allowMethods(req, ['POST']);
  const user = await requireUser(req);
  const { days } = jsonBody<{ days?: number }>(req);

  const { data: p, error } = await supabaseAdmin()
    .from('profiles')
    .select('email, subscription_tier, subscription_expires_at')
    .eq('id', user.id)
    .single();
  if (error || !p) throw new HttpError(404, 'Profile not found');

  const subExp = p.subscription_expires_at ? Date.parse(p.subscription_expires_at) : Infinity;
  if (!isPaidTier(p.subscription_tier) || subExp < Date.now()) {
    throw new HttpError(403, 'Offline licences require an active Professional or Enterprise subscription.');
  }

  const now = Date.now();
  const d = Math.min(30, Math.max(1, Math.floor(Number(days) || 30)));
  const claims: OfflineLicenseClaims = {
    v: 2,
    sub: user.id,
    email: p.email,
    tier: p.subscription_tier,
    iat: now,
    exp: Math.min(now + d * 86400000, subExp)
  };

  const pem = env('LICENSE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const payload = Buffer.from(JSON.stringify(claims), 'utf8');
  const signature = sign(null, payload, createPrivateKey(pem));
  send(res, 200, { token: `${LICENSE_PREFIX}${b64url(payload)}.${b64url(signature)}`, claims });
});
