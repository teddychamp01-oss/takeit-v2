// Take It v2 — shared CORS + JSON response helpers for edge functions.
// Webhook endpoints (Telegram, Chapa) are server-to-server and never need
// CORS, but every function still answers OPTIONS correctly so a misdirected
// browser call fails loudly with JSON instead of dying on a preflight.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, ' +
    'x-telegram-bot-api-secret-token, chapa-signature, x-chapa-signature, ' +
    'x-purge-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Returns the preflight response for OPTIONS requests, else null. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** JSON response with CORS headers. All errors leave a function as JSON. */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
