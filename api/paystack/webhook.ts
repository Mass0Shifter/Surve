import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, handle, HttpError, rawBody, send } from '../_lib/server.js';
import { fulfil } from '../_lib/paystack.js';

/**
 * Paystack webhook (set this URL in Paystack Dashboard → Settings → API Keys & Webhooks):
 *   https://<your-domain>/api/paystack/webhook
 * Signature: HMAC-SHA512 of the raw body with the secret key, in `x-paystack-signature`.
 */
export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const raw = await rawBody(req);
  const text = raw.length ? raw.toString('utf8') : JSON.stringify(req.body ?? {});
  const sig = String(req.headers['x-paystack-signature'] || '');
  const expected = createHmac('sha512', env('PAYSTACK_SECRET_KEY')).update(text).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Invalid signature');

  const event = JSON.parse(text);
  if (event?.event === 'charge.success' && typeof event.data?.reference === 'string') {
    try {
      await fulfil(event.data.reference);
    } catch (err) {
      // Unknown references (e.g. charges from other apps on the same account) are acknowledged.
      if (!(err instanceof HttpError && err.status === 404)) throw err;
    }
  }
  send(res, 200, { received: true });
});
