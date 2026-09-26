/* Erzeugt die Produktbilder für die Landingpage (shots/*.jpg: Analyse, Denkfehler, Review, Training) und das Vorschaubild für soziale Netze (icons/og-image.png).
   Voraussetzung: Node.js mit Playwright und ein lokaler Server im Ordner personal/chess:
       python3 -m http.server 8765
       node tools/screenshots.js            # optional: PLAYWRIGHT=/pfad/zu/playwright node tools/screenshots.js
   Die Bilder zeigen die echte App (Beispielpartie Kasparow – Topalow) im dunklen Design. */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8765/';
const OUT = path.join(__dirname, '..');
// Blackburne-Schilling-Falle: Weiß greift zweimal daneben
const TRAP = '[White "Anna"]\n[Black "Ben"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1';

async function analysed(p, timeout) {
  await p.waitForFunction(() => window.__zugradar && window.__zugradar.engine.state === 'ready', null, { timeout: 90000 });
  // Warten, bis jeder Zug bewertet und das Review in voller Tiefe fertig ist
  await p.waitForFunction(() => {
    const z = window.__zugradar, r = z.classifyAll(), pr = z.an.reviewProgress();
    return r.length === z.state.line.length && r.every(Boolean) && pr.done >= pr.total;
  }, null, { timeout, polling: 1000 });
}

async function appPage(browser, lang, viewport, mobile) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: !!mobile,
    colorScheme: 'dark', locale: lang === 'en' ? 'en-GB' : 'de-DE'
  });
  const p = await ctx.newPage();
  await p.goto(BASE + 'zugradar.html');
  // Frischer Start in der gewünschten Sprache, Willkommenskarte schon gesehen
  await p.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('zugradar.lang', l);
  }, lang);
  await p.reload();
  await p.waitForFunction(() => window.__zugradar, null, { timeout: 30000 });
  await p.evaluate(() => { const z = window.__zugradar; z.state.settings.welcomed = true; z.render(); });
  return { ctx, p };
}

(async () => {
  const browser = await chromium.launch();
  for (const lang of ['de', 'en']) {
    // 1) Desktop: Analyse mit brillantem Zug, Coach, Engine-Linien
    let { ctx, p } = await appPage(browser, lang, { width: 1280, height: 800 });
    await analysed(p, 240000);
    await p.evaluate(() => window.__zugradar.go(47));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(OUT, 'shots', lang + '-analyse.jpg'), type: 'jpeg', quality: 84 });

    // 1b) Desktop: Denkfehler-Diagnose an der Fallen-Partie (5.Sxf7 übersieht die Drohung Dxg2)
    await p.evaluate((pgn) => window.__zugradar.importText(pgn, { user: { name: 'Anna', color: 'w' } }), TRAP);
    await analysed(p, 180000);
    await p.evaluate(() => window.__zugradar.go(9));
    await p.waitForFunction(() => document.querySelector('#verdict .v-cause') && !document.querySelector('#verdict .cause-pending'), null, { timeout: 60000 })
      .catch(() => console.warn('Hinweis: Denkfehler noch nicht fertig – ' + lang + '-diagnose.jpg prüfen.'));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(OUT, 'shots', lang + '-diagnose.jpg'), type: 'jpeg', quality: 84 });
    await ctx.close();

    // 2) Handy: Partie-Review
    ({ ctx, p } = await appPage(browser, lang, { width: 390, height: 844 }, true));
    await analysed(p, 240000);
    await p.evaluate(() => window.__zugradar.go(47));
    await p.waitForTimeout(1200);
    // Oberer Teil des Reviews: Verlauf, Genauigkeit, Bilanz (Handy-Seitenverhältnis)
    const box = await p.locator('#review').boundingBox();
    const top = await p.evaluate(() => window.scrollY);
    await p.screenshot({ path: path.join(OUT, 'shots', lang + '-review.jpg'), type: 'jpeg', quality: 84, fullPage: true,
                         clip: { x: box.x, y: box.y + top, width: box.width, height: Math.min(box.height, 740) } });

    // 3) Handy: Fehler-Training an einer kurzen Fallen-Partie mit klaren Fehlern von Weiß
    await p.evaluate((pgn) => window.__zugradar.importText(pgn), TRAP);
    await analysed(p, 120000);
    await p.evaluate(() => window.scrollTo(0, 0));
    if (await p.isDisabled('#btnTrain')) {
      console.warn('Hinweis: keine trainierbaren Fehler in dieser Analyse – ' + lang + '-training.jpg bleibt unverändert.');
      await ctx.close();
      continue;
    }
    await p.click('#btnTrain');
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(OUT, 'shots', lang + '-training.jpg'), type: 'jpeg', quality: 84 });
    await ctx.close();
  }

  // Vorschaubild für soziale Netze (1200×630)
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(BASE + 'tools/og.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'icons', 'og-image.png') });
  await browser.close();
  console.log('OK: shots/*.jpg, icons/og-image.png');
})().catch((e) => { console.error(e); process.exit(1); });
