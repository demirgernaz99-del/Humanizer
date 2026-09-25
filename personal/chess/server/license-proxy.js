/* Optionaler Lizenz-Proxy als Cloudflare Worker (kostenloser Tarif reicht).
   Nur nötig, falls Browser die Lizenz-API deines Shops wegen CORS nicht direkt erreichen.
   Deployment: dash.cloudflare.com → Workers → „Create“ → diesen Code einfügen → Deploy.
   Danach in seller.json: "license": { …, "api": "https://<dein-worker>.workers.dev" } und python3 build.py.
   PROVIDER und ALLOWED_ORIGIN unten anpassen. Der Proxy reicht nur activate/validate/deactivate durch. */
const PROVIDER = 'lemonsqueezy'; // oder 'polar'
const UPSTREAMS = {
  lemonsqueezy: 'https://api.lemonsqueezy.com/v1/licenses/',
  polar: 'https://api.polar.sh/v1/customer-portal/license-keys/'
};
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
    const json = PROVIDER === 'polar';
    const res = await fetch(UPSTREAMS[PROVIDER] + op, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' },
      body
    });
    return new Response(await res.text(), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
