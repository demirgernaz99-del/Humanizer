/* Rendert icons/icon.svg in die PNG-Größen für PWA und iOS (einmalig; braucht Playwright):
   node tools/make_icons.js */
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const dir = path.join(__dirname, '..', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1], ['apple-touch-icon.png', 180, 0], ['favicon-32.png', 32, 0]];
  for (const [name, size, pad] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - 2 * pad));
    await p.setContent(`<html><body style="margin:0;background:#16191b;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
    await p.screenshot({ path: path.join(dir, name), omitBackground: false });
    console.log('OK', name);
  }
  await b.close();
})();
