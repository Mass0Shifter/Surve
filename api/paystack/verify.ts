import { allowMethods, handle, HttpError, jsonBody, requireUser, send, supabaseAdmin } from '../_lib/server.js';
import { fulfil } from '../_lib/paystack.js';

/** POST { reference } → { status, tier?, expiresAt? } — called when the user returns from Paystack. */
export default handle(async (req, res) => {
  allowMethods(req, ['POST']);
  const user = await requireUser(req);
  const { reference } = jsonBody<{ reference?: string }>(req);
  if (!reference || typeof reference !== 'string' || reference.length > 100) throw new HttpError(400, 'Missing payment reference');

  const { data: tx } = await supabaseAdmin().from('payment_transactions').select('user_id').eq('reference', reference).maybeSingle();
  if (!tx || tx.user_id !== user.id) throw new HttpError(404, 'Payment not found for this account');

  send(res, 200, await fulfil(reference));
});
