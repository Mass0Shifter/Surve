import { handle, send } from './_lib/server.js';

export default handle(async (_req, res) => {
  send(res, 200, {
    ok: true,
    configured: {
      supabase: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY),
      paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      license: Boolean(process.env.LICENSE_PRIVATE_KEY)
    }
  });
});
