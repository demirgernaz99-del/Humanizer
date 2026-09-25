/* Optionaler Lizenz-Proxy als Cloudflare Worker (kostenloser Tarif reicht).
   Nur nötig, falls Browser die Lemon-Squeezy-Lizenz-API wegen CORS nicht direkt erreichen.
   Deployment: dash.cloudflare.com → Workers → „Create“ → diesen Code einfügen → Deploy.
   Danach in src/config.js: license.api = 'https://<dein-worker>.workers.dev/v1/licenses'
   ALLOWED_ORIGIN auf deine Website setzen. Der Proxy reicht nur activate/validate/deactivate durch. */
const UPSTREAM = 'https://api.lemonsqueezy.com/v1/licenses/';
const ALLOWED_ORIGIN = 'https://demirgernaz99-del.github.io';
const OPS = ['activate', 'validate', 'deactivate'];

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const op = new URL(request.url).pathname.split('/').pop();
    if (request.method !== 'POST' || !OPS.includes(op)) return new Response('Not found', { status: 404, headers: cors });
    const body = await request.text();
    if (body.length > 2000) return new Response('Too large', { status: 413, headers: cors });
    const res = await fetch(UPSTREAM + op, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    return new Response(await res.text(), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
