import { randomBytes } from 'node:crypto';
import { allowMethods, appOrigin, handle, HttpError, jsonBody, requireUser, send, supabaseAdmin } from '../_lib/server.js';
import { amountFor, paystack } from '../_lib/paystack.js';

/** POST { tier, frequency } → { authorizationUrl, reference } */
export default handle(async (req, res) => {
  allowMethods(req, ['POST']);
  const user = await requireUser(req);
  const body = jsonBody<{ tier?: string; frequency?: string }>(req);
  const { tier, frequency, amount } = amountFor(body.tier, body.frequency);
  if (!user.email) throw new HttpError(400, 'Your account has no email address.');

  const reference = `NSV_${Date.now()}_${randomBytes(6).toString('hex')}`;
  const db = supabaseAdmin();
  const { error } = await db.from('payment_transactions').insert({
    reference,
    user_id: user.id,
    user_email: user.email,
    tier,
    frequency,
    amount,
    currency: 'NGN',
    gateway: 'paystack',
    status: 'PENDING'
  });
  if (error) throw new HttpError(500, 'Could not start checkout. Please try again.');

  const init = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      amount: Math.round(amount * 100), // kobo
      currency: 'NGN',
      reference,
      callback_url: `${appOrigin(req)}/?payment_ref=${encodeURIComponent(reference)}`,
      metadata: { user_id: user.id, tier, frequency }
    })
  });

  send(res, 200, { authorizationUrl: init.data.authorization_url, reference });
});
