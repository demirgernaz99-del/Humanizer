/* Selbsttest für Lizenz, Bibliothek, Trainer (SRS) und Insights (Node): node src/pro.selftest.js */
'use strict';
var path = require('path');
var L = require(path.join(__dirname, 'vendor/chess.js'));
var CFG = require(path.join(__dirname, 'config.js'));
var LIC = require(path.join(__dirname, 'license.js'));
var LB = require(path.join(__dirname, 'library.js'));
var INS = require(path.join(__dirname, 'insights.js'));
var SK = globalThis.SK;

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FEHLER:', m); } }
function eq(a, b, m) { ok(a === b, m + ' (erwartet ' + JSON.stringify(b) + ', bekommen ' + JSON.stringify(a) + ')'); }
var T = 1790000000000, DAY = 86400000;
LIC._now = function () { return T; };
SK._now = function () { return T; };

/* ---------- Lizenz ---------- */
eq(LIC.state().plan, 'free', 'Start: kostenlos');
eq(LIC.limits().insightsGames, CFG.free.insightsGames, 'Free-Grenzen aktiv');
ok(LIC.startTrial(), 'Test starten');
eq(LIC.state().plan, 'trial', 'Testphase aktiv');
ok(LIC.isPro(), 'Testphase = Pro-Funktionen');
ok(!LIC.startTrial(), 'Test nur einmal');
T += 8 * DAY;
eq(LIC.state().plan, 'free', 'Test nach 7 Tagen abgelaufen');

function lsFetch(handler) {
  var calls = [];
  var f = function (url, opts) {
    calls.push({ url: url, body: opts.body });
    var params = {};
    opts.body.split('&').forEach(function (kv) { var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    var r = handler(url.split('/').pop(), params);
    if (r === 'NETWORK') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ status: r.status || 200, json: function () { return Promise.resolve(r.body); } });
  };
  f.calls = calls; return f;
}
var good = lsFetch(function (op, p) {
  if (op === 'activate') return p.license_key === 'GOOD-KEY-1234'
    ? { body: { activated: true, instance: { id: 'inst1' }, license_key: { status: 'active', expires_at: null }, meta: { store_id: 42, product_id: 7, product_name: 'Zugradar Pro', customer_email: 'k@example.com' } } }
    : { status: 400, body: { activated: false, error: 'license_key not found.' } };
  if (op === 'validate') return { body: { valid: true, license_key: { status: 'active', expires_at: null }, meta: { store_id: 42, product_id: 7 } } };
  if (op === 'deactivate') return { body: { deactivated: true } };
});

Promise.resolve()
.then(function () { return LIC.activate('WRONG-KEY-000', good).then(function () { ok(false, 'falscher Schlüssel darf nicht gehen'); }, function (e) { eq(e.code, 'rejected', 'falscher Schlüssel abgelehnt'); ok(/not found/.test(e.message), 'Fehlertext vom Server'); }); })
.then(function () { return LIC.activate('GOOD-KEY-1234', good); })
.then(function (s) {
  eq(s.plan, 'pro', 'gültiger Schlüssel → Pro');
  eq(s.email, 'k@example.com', 'Käufer-E-Mail gespeichert');
  eq(s.key, 'GOOD…1234', 'Schlüssel maskiert');
  ok(/license_key=GOOD-KEY-1234/.test(good.calls[1].body), 'Schlüssel formularkodiert gesendet');
  eq(LIC.limits().insightsGames, CFG.pro.insightsGames, 'Pro-Grenzen aktiv');
  // Shop-Abgleich
  CFG.license.storeId = 99;
  return LIC.activate('GOOD-KEY-1234', good).then(function () { ok(false, 'fremder Shop'); }, function (e) { eq(e.code, 'wrong_product', 'Schlüssel eines fremden Shops abgelehnt'); });
})
.then(function () {
  CFG.license.storeId = null;
  return LIC.activate('GOOD-KEY-1234', good);
})
.then(function () {
  // Offline: nach 7 Tagen Nachprüfung scheitert am Netz → Kulanz, nach 14 Tagen ohne Prüfung → Free
  T += 8 * DAY;
  var offline = lsFetch(function () { return 'NETWORK'; });
  return LIC.revalidate(false, offline).then(function (s) {
    eq(s.plan, 'pro', 'offline: Kulanzzeit hält Pro');
    ok(s.offline, 'offline markiert');
    T += 7 * DAY;
    eq(LIC.state().plan, 'free', 'nach Kulanzzeit ohne Prüfung → Free');
    return LIC.revalidate(true, good);
  });
})
.then(function (s) {
  eq(s.plan, 'pro', 'erfolgreiche Nachprüfung → wieder Pro');
  var revoked = lsFetch(function () { return { body: { valid: false, license_key: { status: 'disabled' }, error: null } }; });
  return LIC.revalidate(true, revoked);
})
.then(function (s) {
  eq(s.plan, 'free', 'gesperrte Lizenz → Free');
  ok(/disabled/.test(s.problem), 'Grund wird angezeigt');
  return LIC.deactivate(good);
})
.then(function () {
  // Serverfehler (5xx) beim Nachprüfen entzieht Pro nicht, sondern gilt als offline
  return LIC.activate('GOOD-KEY-1234', good).then(function () {
    var down = lsFetch(function () { return { status: 503, body: { error: 'Service Unavailable' } }; });
    return LIC.revalidate(true, down);
  }).then(function (s) {
    eq(s.plan, 'pro', '5xx beim Nachprüfen → Pro bleibt');
    ok(s.offline, '5xx → als offline markiert');
    return LIC.deactivate(good);
  });
})
.then(function () {
  /* ---------- Polar ---------- */
  CFG.license.provider = 'polar'; CFG.license.organizationId = 'org-uuid-1';
  var ORG_OK = function (b) { return b.organization_id === 'org-uuid-1'; };
  function polarFetch(handler) {
    var calls = [];
    var f = function (url, opts) {
      calls.push({ url: url, body: opts.body, ct: opts.headers['Content-Type'] });
      var r = handler(url.split('/').pop(), JSON.parse(opts.body));
      if (r === 'NETWORK') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ status: r.status || 200, json: function () { return r.body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(r.body); } });
    };
    f.calls = calls; return f;
  }
  var lk = { id: 'lk1', status: 'granted', expires_at: null, benefit_id: 'ben-1', customer: { email: 'p@example.com' } };
  var pol = polarFetch(function (op, b) {
    if (!ORG_OK(b)) return { status: 422, body: { detail: [{ msg: 'bad org' }] } };
    if (op === 'activate') return b.key === 'POLAR-GOOD-KEY' ? { body: { id: 'act-1', license_key_id: 'lk1', label: b.label, license_key: lk } }
      : b.key === 'POLAR-FULL-KEY' ? { status: 403, body: { error: 'NotPermitted', detail: 'License key activation limit already reached' } }
      : b.key === 'POLAR-NOACT-KEY' ? { status: 403, body: { error: 'NotPermitted', detail: 'This license key does not support activations. Use the /validate endpoint instead to check license validity.' } }
      : { status: 404, body: { error: 'ResourceNotFound', detail: 'Not found' } };
    if (op === 'validate') return b.key === 'POLAR-REVOKED' ? { status: 404, body: { error: 'ResourceNotFound', detail: 'License key is no longer active.' } }
      : { body: Object.assign({}, lk, { activation: b.activation_id ? { id: b.activation_id } : null }) };
    if (op === 'deactivate') return { status: 204 };
  });
  return LIC.activate('POLAR-WRONG', pol).then(function () { ok(false, 'Polar: falscher Schlüssel'); }, function (e) { eq(e.code, 'rejected', 'Polar: unbekannter Schlüssel abgelehnt'); })
  .then(function () { return LIC.activate('POLAR-FULL-KEY', pol).then(function () { ok(false, 'Polar: Limit'); }, function (e) { ok(/limit/i.test(e.message), 'Polar: Geräte-Limit wird gemeldet'); }); })
  .then(function () { return LIC.activate('POLAR-GOOD-KEY', pol); })
  .then(function (s) {
    eq(s.plan, 'pro', 'Polar: gültiger Schlüssel → Pro');
    eq(s.email, 'p@example.com', 'Polar: Käufer-E-Mail');
    var c = pol.calls[pol.calls.length - 1];
    ok(/customer-portal\/license-keys\/activate$/.test(c.url), 'Polar: richtige Adresse');
    eq(c.ct, 'application/json', 'Polar: JSON gesendet');
    return LIC.revalidate(true, pol);
  })
  .then(function (s) {
    eq(s.plan, 'pro', 'Polar: Nachprüfung ok');
    eq(JSON.parse(pol.calls[pol.calls.length - 1].body).activation_id, 'act-1', 'Polar: Aktivierungs-ID wird mitgeprüft');
    CFG.license.benefitIds = ['ben-other'];
    return LIC.revalidate(true, pol);
  })
  .then(function (s) {
    eq(s.plan, 'free', 'Polar: Schlüssel eines anderen Vorteils → Free');
    CFG.license.benefitIds = [];
    return LIC.activate('POLAR-NOACT-KEY', pol);
  })
  .then(function (s) {
    eq(s.plan, 'pro', 'Polar: Schlüssel ohne Aktivierungs-Limit → nur geprüft, Pro');
    return LIC.deactivate(pol);
  })
  .then(function () {
    var n = pol.calls.length;
    eq(pol.calls[n - 1].url.split('/').pop(), 'validate', 'Polar: ohne Aktivierung kein deactivate-Aufruf nötig');
    CFG.license.provider = 'lemonsqueezy'; CFG.license.organizationId = '';
    return LIC.state();
  });
})
.then(function (s) {
  eq(s.plan, 'free', 'nach Abmelden Free');
  eq(LIC.dayCount('trainer'), 0, 'Tageszähler startet bei 0');
  LIC.dayCount('trainer', 2);
  eq(LIC.dayCount('trainer'), 2, 'Tageszähler zählt');
  T += DAY;
  eq(LIC.dayCount('trainer'), 0, 'Tageszähler neuer Tag');

  /* ---------- Bibliothek ---------- */
  var lib = LB.library;
  var e1 = lib.entryFrom({ site: 'lichess', id: 'abc', end: T - DAY, white: { name: 'me' }, black: { name: 'x' }, result: '1-0', userColor: 'w', userResult: 'win' }, '1. e4 e5 1-0');
  lib.put(e1);
  var e2 = lib.entryFrom(null, '[White "A"]\n[Black "B"]\n[Date "2026.09.01"]\n1. d4 d5 *', { White: 'A', Black: 'B', Date: '2026.09.01' });
  lib.put(e2);
  eq(lib.all().length, 2, 'zwei Partien gespeichert');
  eq(lib.all()[0].id, 'lichess:abc', 'neueste zuerst');
  ok(/^pgn:/.test(e2.id), 'PGN ohne Plattform bekommt Hash-ID');
  eq(lib.entryFrom(null, '[White "Z"]\n1. d4 d5 {x} *').id, e2.id, 'gleiche Züge = gleiche ID (Kopfzeilen/Kommentare egal)');
  lib.put(Object.assign({}, e1, { result: '0-1' }));
  eq(lib.all().length, 2, 'erneutes Speichern ersetzt');
  lib.remove('lichess:abc');
  eq(lib.all().length, 1, 'Löschen');

  /* ---------- Trainer (SRS) ---------- */
  var srs = LB.srs;
  eq(srs.add([{ id: 'g:1', fen: 'x', bestUci: 'e2e4' }, { id: 'g:2', fen: 'y', bestUci: 'd2d4' }, { id: 'g:1', fen: 'x' }]), 2, 'Aufgaben ohne Duplikate');
  eq(srs.due().length, 2, 'neue Aufgaben sind fällig');
  srs.answer('g:1', true);
  eq(srs.due().length, 1, 'gelöste Aufgabe verschwindet');
  T += 1 * DAY + 1;
  eq(srs.due().length, 2, 'nach 1 Tag wieder fällig');
  srs.answer('g:1', true);
  T += 1 * DAY + 1;
  eq(srs.due().filter(function (p) { return p.id === 'g:1'; }).length, 0, 'Kasten 2: noch nicht fällig nach 1 Tag');
  srs.answer('g:2', false);
  eq(srs.all().filter(function (p) { return p.id === 'g:2'; })[0].box, 0, 'falsch → zurück in Kasten 0');
  T += 11 * 60000;
  ok(srs.due().some(function (p) { return p.id === 'g:2'; }), 'falsche Aufgabe kommt nach 10 Min wieder');
  eq(srs.stats().total, 2, 'Statistik');

  /* ---------- Insights: echte Auswertung einer Partie mit nachgebildeter Engine ---------- */
  var sans = 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#'.split(' ');
  var c = new L.Chess(), moves = [];
  sans.forEach(function (s, i) {
    var fb = c.fen(), n = c.moves().length, chk = c.inCheck();
    var m = c.move(s);
    moves.push({ san: m.san, from: m.from, to: m.to, promotion: m.promotion, piece: m.piece, captured: m.captured, flags: m.flags,
                 color: m.color, uci: m.from + m.to + (m.promotion || ''), fenBefore: fb, fenAfter: c.fen(), legalCount: n, inCheck: chk,
                 clock: 180 - i, spent: i === 5 ? 1 : 5 });
  });
  function key(f) { return f.split(' ').slice(0, 4).join(' '); }
  var an = {};
  moves.forEach(function (m, i) {
    // jede Stellung: gespielter Zug ist der beste mit ~0.3, außer vor Sf6 (dort ist g6 besser)
    an[key(m.fenBefore)] = { depth: 14, lines: [{ uci: i === 5 ? 'g7g6' : m.uci, score: { cp: 30 }, pv: [i === 5 ? 'g7g6' : m.uci] }, { uci: 'a2a3', score: { cp: 0 }, pv: ['a2a3'] }] };
  });
  an[key(moves[5].fenAfter)] = { depth: 14, lines: [{ uci: 'h5f7', score: { mate: 1 }, pv: ['h5f7'] }] };
  var game = INS.analyzeGame(moves, function (f) { return an[key(f)] || null; }, {
    minDepth: 12, timeControl: '180+2', gameId: 'lichess:abc', userColor: 'b',
    terminal: function (f) { var x = new L.Chess(f); return x.isCheckmate() ? 'mate' : null; } });
  ok(!!game, 'Partie ausgewertet');
  eq(game.moves[5].key, 'blunder', '3...Sf6 als Patzer');
  ok(game.moves[5].tags.indexOf('mate_allowed') >= 0, 'Tag: Matt zugelassen');
  ok(game.moves[5].tags.indexOf('fast') >= 0, 'Tag: zu schnell (1 s)');
  eq(game.moves[0].key, 'book', '1.e4 als Theorie');
  eq(game.opening, "King's Pawn Game: Wayward Queen Attack", 'Eröffnungsname (Datenbank)');
  eq(game.eco, 'C20', 'ECO-Code');
  eq(require(path.join(__dirname, 'openings.js')).deName(game.opening), 'Königsbauernspiel: Parham-Angriff', 'deutscher Eröffnungsname');
  ok(game.bookExit && game.bookExit.move === 3 && game.bookExit.color === 'b' && game.bookExit.san === 'Nf6', 'Theorie verlassen mit 3…Sf6: ' + JSON.stringify(game.bookExit));
  ok(game.bookExit && game.bookExit.key === 'blunder' && game.bookExit.theory.length > 0, 'Abweichung bewertet, Theoriezüge genannt: ' + JSON.stringify(game.bookExit && game.bookExit.theory));
  eq(game.puzzles.length, 1, 'eine Aufgabe für Schwarz');
  eq(game.puzzles[0].bestUci, 'g7g6', 'Aufgabe mit richtiger Lösung');
  eq(INS.analyzeGame(moves, function () { return null; }, {}), null, 'ohne Engine-Daten: null');

  /* ---------- Insights: Profil über viele Partien ---------- */
  function g(id, color, res, acc, keys, tags, opening, phase) {
    return { id: id, end: T + id.length, userColor: color, userResult: res, analysis: { acc: { w: color === 'w' ? acc : 50, b: color === 'b' ? acc : 50 }, opening: opening,
      moves: keys.map(function (k, i) { return { color: color, key: k, acc: k === 'blunder' ? 10 : 95, phase: phase || (i < 2 ? 'opening' : 'endgame'), tags: tags[i] || [], clock: 30 }; }) } };
  }
  var entries = [
    g('a', 'w', 'win', 80, ['best', 'best', 'blunder'], [[], [], ['hanging']], 'Italienische Partie'),
    g('bb', 'b', 'loss', 60, ['best', 'blunder', 'mistake'], [[], ['hanging', 'fast'], ['hanging']], 'Sizilianische Verteidigung'),
    g('ccc', 'b', 'loss', 55, ['blunder', 'best', 'mistake'], [['hanging'], [], ['time_trouble']], 'Sizilianische Verteidigung'),
    g('dddd', 'b', 'loss', 58, ['mistake', 'best'], [['win_missed'], []], 'Sizilianische Verteidigung'),
    g('eeeee', 'w', 'draw', 90, ['best', 'brilliant'], [[], []], 'Italienische Partie'),
    { id: 'x', end: 1, userColor: null, analysis: null }
  ];
  // Eröffnungs-Check: zwei Sizilianer mit derselben teuren Abweichung, eine harmlose Abweichung
  entries[1].analysis.bookExit = { ply: 4, move: 2, color: 'b', san: 'a6', key: 'mistake', loss: 12, theory: ['d6', 'Nc6'] };
  entries[2].analysis.bookExit = { ply: 4, move: 2, color: 'b', san: 'a6', key: 'inaccuracy', loss: 8, theory: ['d6', 'Nc6'] };
  entries[3].analysis.bookExit = { ply: 6, move: 3, color: 'b', san: 'e6', key: 'good', loss: 1, theory: [] };
  entries[0].analysis.bookExit = { ply: 5, move: 3, color: 'b', san: 'h6', key: 'inaccuracy', loss: 9, theory: [] };
  var r = INS.aggregate(entries);
  eq(r.leaks.length, 1, 'Eröffnungs-Leck: nur eigene, teure Abweichung');
  ok(r.leaks[0].san === 'a6' && r.leaks[0].n === 2 && Math.round(r.leaks[0].loss) === 10, 'Leck zusammengefasst: ' + JSON.stringify(r.leaks[0]));
  var sic = r.openings.filter(function (o) { return /Sizili/.test(o.name); })[0];
  eq(Math.round(sic.exit * 10) / 10, 2.3, 'Theorie im Schnitt bis Zug 2,3');
  eq(r.n, 5, 'nur analysierte Partien mit bekannter Farbe');
  eq(r.wins + r.draws + r.losses, 5, 'Ergebnisse gezählt');
  eq(Math.round(r.score * 100), 30, 'Punkteschnitt 30 %');
  eq(r.errors, 6, 'eigene Fehler gezählt');
  eq(r.tags.hanging, 4, 'hängende Figuren gezählt');
  eq(r.weaknesses[0].id, 'hanging', 'größte Baustelle: hängende Figuren');
  ok(r.weaknesses.some(function (w) { return w.id === 'opening' && /Sizilian/.test(w.name); }), 'schwache Eröffnung erkannt');
  eq(r.highlights.brilliant, 1, 'brillante Züge gezählt');
  eq(r.openings[0].name, 'Sizilianische Verteidigung', 'häufigste Eröffnung zuerst');
  eq(r.byColor.w.n, 2, 'Partien mit Weiß');

  console.log((fail ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
})
.catch(function (e) { console.log('ABBRUCH', e); process.exit(1); });
