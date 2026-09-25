/* Selbsttest für SK.classify, SK.book und den UCI-Parser (Node, ohne Engine):
   node src/classify.selftest.js */
'use strict';
var path = require('path');
var L = require(path.join(__dirname, 'vendor/chess.js'));
var C = require(path.join(__dirname, 'classify.js'));
var B = require(path.join(__dirname, 'openings.js'));
var E = require(path.join(__dirname, 'engine.js'));

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FEHLER:', msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (erwartet ' + b + ', bekommen ' + a + ')'); }

function after(sans) {
  var c = new L.Chess();
  sans.split(' ').forEach(function (s) { c.move(s); });
  return c.fen();
}
function mv(fen, san) {
  var c = new L.Chess(fen), m = c.move(san);
  return { from: m.from, to: m.to, promotion: m.promotion, san: m.san, piece: m.piece, captured: m.captured, flags: m.flags, fenAfter: c.fen() };
}
function legal(fen) { return new L.Chess(fen).moves().length; }
function an(lines, depth) {
  return { depth: depth || 18, lines: lines.map(function (l) { return { uci: l[0], score: l[1], pv: [l[0]] }; }) };
}

/* ---------- Gewinnchance ---------- */
eq(Math.round(C.cpToWp(0)), 50, 'cp 0 → 50 %');
ok(Math.abs(C.cpToWp(300) + C.cpToWp(-300) - 100) < 1e-9, 'Symmetrie der Gewinnchance');
ok(C.cpToWp(5000) === C.cpToWp(1000), 'Kappung bei ±10 Bauern');
eq(C.scoreWp({ mate: 3 }), 100, 'Matt für den Ziehenden → 100');
eq(C.scoreWp({ mate: -2 }), 0, 'Matt gegen den Ziehenden → 0');
eq(C.fmtScore({ cp: 170 }), '+1.70', 'Format +1.70');
eq(C.fmtScore({ cp: -35 }), '−0.35', 'Format −0.35');
eq(C.fmtScore({ mate: -2 }), '#-2', 'Format #-2');
ok(C.moveAccuracy(50, 50) > 99.9, 'Genauigkeit ohne Verlust ≈ 100');
ok(C.moveAccuracy(80, 30) < 15, 'Genauigkeit bei Patzer klein');

/* ---------- SEE ---------- */
// Weißer Springer d5, angegriffen von c6, gedeckt von e4 → Schwarz gewinnt netto 2 (S gegen B)
var c1 = new L.Chess('4k3/8/2p5/3N4/4P3/8/8/4K3 b - - 0 1');
eq(C.see(c1, 'd5'), 2, 'SEE Springer gegen Bauer');
// Ungedeckter Turm → volle 5
var c2 = new L.Chess('4k3/8/8/3R4/8/8/8/3qK3 b - - 0 1');
eq(C.see(c2, 'd5'), 5, 'SEE hängender Turm');
// Gedeckte Dame, angegriffen von Dame → Schlagen lohnt nicht (9 − 9 = 0)
var c3 = new L.Chess('4k3/8/8/3Q4/4P3/8/8/3qK3 b - - 0 1');
eq(C.see(c3, 'd5'), 0, 'SEE gedeckte Dame gegen Dame');

/* ---------- Opfer-Erkennung ---------- */
var legalFen = after('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6');
var sac = C.detectSacrifice(legalFen, mv(legalFen, 'Nxe5'), { cp: 170 });
ok(sac && sac.piece === 'q' && sac.square === 'd1', 'Légal: Damenopfer auf d1 erkannt');
// Gleicher Tausch (Springer schlägt Springer, Bauer schlägt zurück) ist kein Opfer
var tradeFen = '4k3/8/3p4/4n3/8/5N2/8/4K3 w - - 0 1';
eq(C.detectSacrifice(tradeFen, mv(tradeFen, 'Nxe5'), { cp: 0 }), null, 'Tausch ist kein Opfer');
// Ohne Kompensation (Bewertung passt zum Materialverlust) kein Opfer
eq(C.detectSacrifice(legalFen, mv(legalFen, 'Nxe5'), { cp: -600 }), null, 'Opfer ohne Kompensation zählt nicht');
// Desperado: Figur hing schon vorher und schlägt noch etwas → kein neues Opfer
var fried = after('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5');
eq(C.detectSacrifice(fried, mv(fried, 'Nxf7'), { cp: 20 }), null, 'Desperado ist kein Opfer');

/* ---------- Kategorien ---------- */
function cls(fen, san, before, afterAn, extra) {
  var m = mv(fen, san);
  var c = new L.Chess(fen);
  return C.classifyMove(Object.assign({ fenBefore: fen, move: m, before: before, after: afterAn,
    legalCount: legal(fen), inCheck: c.inCheck() }, extra || {}));
}
// Légal: Sxe5 als bester Zug mit Opfer → brillant
var r = cls(legalFen, 'Nxe5', an([['f3e5', { cp: 170 }], ['c3d5', { cp: 90 }]]), null);
eq(r && r.key, 'brilliant', 'Légal Sxe5 → brillant');
// Schwarz schlägt die Dame und wird mattgesetzt → Patzer
var afterNxe5 = after('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5');
r = cls(afterNxe5, 'Bxd1', an([['d6e5', { cp: -160 }], ['g4e6', { cp: -190 }]]), an([['c4f7', { mate: 2 }]]));
eq(r && r.key, 'blunder', 'Lxd1 → Patzer');
ok(r.loss > 20, 'Patzer-Verlust > 20 %');
// Einziger Zug, der die Stellung hält (keine Schlagfolge, kein Schach) → großartig
var start = new L.Chess().fen();
r = cls(start, 'e4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: -260 }]]), null);
eq(r && r.key, 'great', 'nur ein guter Zug → großartig');
// Zweitbester Zug nur wenig schlechter → bester Zug
r = cls(start, 'e4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: 30 }]]), null);
eq(r && r.key, 'best', 'Top-Zug gespielt → bester Zug');
// Verlustbänder über die Folgestellung
r = cls(start, 'a4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: 30 }]]), an([['e7e5', { cp: 5 }]]));
eq(r && r.key, 'good', '≈3,5 % Verlust → gut');
r = cls(start, 'a4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: 30 }]]), an([['e7e5', { cp: 60 }]]));
eq(r && r.key, 'inaccuracy', '≈9 % Verlust → Ungenauigkeit');
r = cls(start, 'a4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: 30 }]]), an([['e7e5', { cp: 150 }]]));
eq(r && r.key, 'mistake', '≈18 % Verlust → Fehler');
// Nach einem gegnerischen Fehler die Chance nicht genutzt → verpasst
r = cls(start, 'a4', an([['e2e4', { cp: 40 }], ['d2d4', { cp: 30 }]]), an([['e7e5', { cp: 100 }]]), { prevLoss: 15 });
eq(r && r.key, 'miss', 'Gegnerfehler nicht bestraft → verpasst');
// Theorie
r = cls(start, 'e4', an([['d2d4', { cp: 35 }], ['e2e4', { cp: 33 }]]), null, { inBook: true });
eq(r && r.key, 'book', 'Buchzug → Theorie');
// Erzwungen: nur ein legaler Zug
var forcedFen = '1r6/8/8/8/8/2k5/8/K7 w - - 0 1';
eq(legal(forcedFen), 1, 'Testaufbau erzwungen');
r = cls(forcedFen, 'Ka2', an([['a1a2', { cp: -2000 }]]), null);
eq(r && r.key, 'forced', 'einziger legaler Zug → erzwungen');
// Matt setzen ist „bester Zug“, nicht „großartig“
var scholar = after('e4 e5 Qh5 Nc6 Bc4 Nf6');
r = cls(scholar, 'Qxf7#', an([['h5f7', { mate: 1 }], ['h5e5', { cp: 150 }]]), { terminal: 'mate', lines: [], depth: 99 });
eq(r && r.key, 'best', 'Matt in 1 → bester Zug');
// Matt in 1 ausgelassen → verpasst
r = cls(scholar, 'Qxe5+', an([['h5f7', { mate: 1 }], ['h5e5', { cp: 150 }]]), null);
eq(r && r.key, 'miss', 'Matt in 1 ausgelassen → verpasst');
// Rückschlag gilt nie als großartig
var recap = after('e4 d5 exd5');
r = cls(recap, 'Qxd5', an([['d8d5', { cp: 20 }], ['g8f6', { cp: -300 }]]), null, { lastMove: { to: 'd5', captured: 'p' } });
eq(r && r.key, 'best', 'Rückschlag → bester Zug statt großartig');

/* ---------- Zusammenfassung ---------- */
var sum = C.summarize([
  { color: 'w', cls: { key: 'best', accuracy: 100, wpBefore: 55 } },
  { color: 'b', cls: { key: 'blunder', accuracy: 20, wpBefore: 45 } },
  { color: 'w', cls: { key: 'brilliant', accuracy: 100, wpBefore: 90 } },
  { color: 'b', cls: null }
]);
eq(sum.w.counts.brilliant, 1, 'Zählung brillant');
eq(sum.b.counts.blunder, 1, 'Zählung Patzer');
eq(sum.w.n, 2, 'bewertete weiße Züge');
ok(sum.w.accuracy > 99, 'Genauigkeit Weiß hoch');
ok(sum.b.accuracy < 30, 'Genauigkeit Schwarz niedrig');

/* ---------- Eröffnungsbuch ---------- */
var bad = 0;
B.LINES.forEach(function (row) {
  var c = new L.Chess();
  try { row[1].split(' ').forEach(function (s) { c.move(s); }); } catch (e) { bad++; console.log('Ungültige Buchzeile:', row[0], row[1]); }
});
eq(bad, 0, 'alle Buchzeilen legal');
B.build(L);
eq(B.nameFor([start, after('e4'), after('e4 c5'), after('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6')].filter(function (f, i) { return i < 3; })), 'Sizilianische Verteidigung', 'Name Sizilianisch');
eq(B.nameFor([start, after('e4'), after('e4 e5'), after('e4 e5 Nf3'), after('e4 e5 Nf3 Nc6'), after('e4 e5 Nf3 Nc6 Bb5')]), 'Spanische Partie', 'Name Spanisch');
ok(!!B.lookup(after('Nf3 d5 d4')), 'Zugumstellung wird erkannt (Nf3 d5 d4 = d4 d5 Nf3)');

/* ---------- UCI-Parser ---------- */
var info = E.parseInfo('info depth 14 seldepth 20 multipv 2 score cp -35 nodes 24176 nps 396327 hashfull 9 time 61 pv f3e5 d6e5 d1g4');
ok(info && info.depth === 14 && info.multipv === 2 && info.score.cp === -35 && info.pv[0] === 'f3e5', 'parseInfo cp');
info = E.parseInfo('info depth 9 multipv 1 score mate -3 nodes 100 pv a1a8');
ok(info && info.score.mate === -3, 'parseInfo mate');
eq(E.parseInfo('info depth 9 multipv 1 score cp 20 lowerbound nodes 100 pv a1a8'), null, 'Bound-Zeilen werden ignoriert');
eq(E.parseInfo('info depth 10 currmove e2e4 currmovenumber 1'), null, 'Zeilen ohne PV werden ignoriert');
eq(E.posKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'posKey ohne Zugzähler');

console.log((fail ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
