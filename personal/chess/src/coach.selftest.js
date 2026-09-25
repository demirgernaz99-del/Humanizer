/* Selbsttest für SK.coach und SK.connect (Node, ohne Netz – APIs werden nachgebildet):
   node src/coach.selftest.js */
'use strict';
var path = require('path');
var L = require(path.join(__dirname, 'vendor/chess.js'));
var CO = require(path.join(__dirname, 'coach.js'));
var CN = require(path.join(__dirname, 'connect.js'));
CN._retryMs = 5; // Tests: kurze Wartezeit zwischen Wiederholungen

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FEHLER:', msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (erwartet ' + JSON.stringify(b) + ', bekommen ' + JSON.stringify(a) + ')'); }
function after(sans) { var c = new L.Chess(); sans.split(' ').forEach(function (s) { c.move(s); }); return c.fen(); }
function mv(fen, san) { var c = new L.Chess(fen); return c.move(san); }

/* ---------- Motive ---------- */
var forkFen = 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1';
var m = CO.motifOf(forkFen, 'd5c7');
ok(m && m.fork.length === 2 && m.check, 'Springergabel auf König und Turm erkannt');
m = CO.motifOf(after('e4 e5 Qh5 Nc6 Bc4 Nf6'), 'h5f7');
ok(m && m.mate, 'Matt erkannt');
m = CO.motifOf('4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1', 'd1d5');
ok(m && m.wins && m.wins.type === 'r', 'hängender Turm wird gewonnen');
m = CO.motifOf('4k3/8/4p3/3r4/8/8/8/3QK3 w - - 0 1', 'd1d5');
ok(m && !m.wins, 'gedeckter Turm: Dame gegen Turm ist kein Gewinn');

/* ---------- Erklärungen ---------- */
var legal = after('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5');
var lines = CO.explain({ fenBefore: legal, move: mv(legal, 'Bxd1'),
  cls: { key: 'blunder', bestUci: 'd6e5', bestScore: { cp: -160 } },
  after: { depth: 18, lines: [{ uci: 'c4f7', score: { mate: 2 }, pv: ['c4f7'] }] } });
ok(lines.some(function (l) { return /setzt der Gegner in 2 Zügen matt/.test(l); }), 'Patzer: Matt-Drohung erklärt');
ok(lines.some(function (l) { return /dxe5 hätte den Springer/.test(l); }), 'Patzer: besserer Zug gewinnt Springer');
// Figur eingestellt: Dame zieht auf ein Feld, auf dem der Bauer sie schlägt
var hang = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
lines = CO.explain({ fenBefore: hang, move: mv(hang, 'Qd5'), cls: { key: 'blunder', bestUci: 'd1d2', bestScore: { cp: 900 } },
  after: { depth: 18, lines: [{ uci: 'e6d5', score: { cp: 0 }, pv: ['e6d5'] }] } });
ok(lines.some(function (l) { return /Die Dame auf d5 steht ungedeckt – exd5 gewinnt Material/.test(l); }), 'eingestellte Dame erklärt: ' + lines.join(' | '));
// Gute Züge: Gabel wird gelobt
lines = CO.explain({ fenBefore: forkFen, move: mv(forkFen, 'Nxc7+'), cls: { key: 'best' } });
ok(lines.some(function (l) { return /Gabel: Der Springer greift Turm und König an/.test(l); }), 'Gabel beim besten Zug erklärt: ' + lines.join(' | '));
// Uhr: schneller Patzer
lines = CO.explain({ fenBefore: hang, move: mv(hang, 'Qd5'), cls: { key: 'blunder', bestUci: 'd1d2', bestScore: { cp: 900 } },
  after: null, clock: { left: 120, spent: 1.2 } });
ok(lines.some(function (l) { return /nach nur 1 s Bedenkzeit/.test(l); }), 'schneller Patzer erkannt');
lines = CO.explain({ fenBefore: hang, move: mv(hang, 'Qd5'), cls: { key: 'mistake', bestUci: 'd1d2' }, after: null, clock: { left: 12.4, spent: 8 } });
ok(lines.some(function (l) { return /Zeitnot/.test(l); }), 'Zeitnot erkannt');
eq(CO.explain({ fenBefore: hang, move: mv(hang, 'Qd2'), cls: { key: 'good' } }).length, 0, 'unauffälliger Zug ohne Kommentar');

/* ---------- Phasen ---------- */
var start = new L.Chess().fen();
eq(CO.phaseOf(start, true), 'opening', 'Startstellung = Eröffnung');
eq(CO.phaseOf('4k3/8/8/3r4/8/8/8/3QK3 w - - 0 40', false), 'endgame', 'wenige Figuren = Endspiel');
eq(CO.phaseOf('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 14', false), 'middlegame', 'Zug 14 mit allen Figuren = Mittelspiel');

/* ---------- Uhr ---------- */
eq(CO.parseClk('[%clk 0:09:58.1]'), 598.1, '%clk mit Zehnteln');
eq(CO.parseClk('{ [%clk 1:02:03] }'), 3723, '%clk mit Stunden');
eq(CO.parseClk('nichts'), null, 'kein %clk');
eq(JSON.stringify(CO.parseTimeControl('180+2')), '{"base":180,"inc":2}', 'TimeControl 180+2');
eq(CO.parseTimeControl('1/259200'), null, 'Fernschach ohne Uhr');
var spent = CO.timeSpent([598, 597, 590, 580], ['w', 'b', 'w', 'b'], { base: 600, inc: 2 });
eq(JSON.stringify(spent), '[4,5,10,19]', 'verbrauchte Zeit mit Inkrement');
eq(CO.fmtClock(125), '2:05', 'Uhr 2:05');
eq(CO.fmtClock(7.25), '0:07.2', 'Uhr unter 10 s mit Zehnteln');

/* ---------- Konnektor (nachgebildete APIs) ---------- */
function fakeFetch(routes) {
  var calls = [];
  var f = function (url, opts) {
    calls.push({ url: url, opts: opts });
    var r = null;
    Object.keys(routes).forEach(function (k) { if (url.indexOf(k) === 0) r = routes[k]; });
    if (!r) return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(''); } });
    if (r === 'NETWORK') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(typeof r === 'string' ? r : JSON.stringify(r)); } });
  };
  f.calls = calls;
  return f;
}
var PGN = '[Event "Live Chess"]\n[White "Demo_User"]\n[Black "Gegner"]\n[Result "0-1"]\n[TimeControl "180+2"]\n\n1. e4 {[%clk 0:03:01]} e5 {[%clk 0:03:00]} 0-1';
var cc = fakeFetch({
  'https://api.chess.com/pub/player/demo_user/games/archives': { archives: [
    'https://api.chess.com/pub/player/demo_user/games/2026/08', 'https://api.chess.com/pub/player/demo_user/games/2026/09'] },
  'https://api.chess.com/pub/player/demo_user/games/2026/09': { games: [
    { url: 'https://www.chess.com/game/live/2', uuid: 'u2', pgn: PGN, end_time: 1790000000, rules: 'chess', time_class: 'blitz', time_control: '180+2', rated: true,
      white: { username: 'Demo_User', rating: 1432, result: 'resigned' }, black: { username: 'Gegner', rating: 1450, result: 'win' } },
    { url: 'https://www.chess.com/game/live/3', uuid: 'u3', pgn: PGN, end_time: 1790000500, rules: 'chess960', time_class: 'blitz',
      white: { username: 'Demo_User', rating: 1432, result: 'win' }, black: { username: 'X', rating: 1, result: 'resigned' } }] },
  'https://api.chess.com/pub/player/demo_user/games/2026/08': { games: [
    { url: 'https://www.chess.com/game/live/1', uuid: 'u1', pgn: PGN, end_time: 1780000000, rules: 'chess', time_class: 'rapid', time_control: '600',
      white: { username: 'Gegner', rating: 1500, result: 'agreed' }, black: { username: 'Demo_User', rating: 1430, result: 'agreed' } }] }
});
var LI = [
  { id: 'abcd1234', variant: 'standard', speed: 'blitz', status: 'mate', rated: true, createdAt: 1790000000000, lastMoveAt: 1790000300000,
    players: { white: { user: { name: 'Gegner' }, rating: 1600 }, black: { user: { name: 'demo_user' }, rating: 1580 } },
    winner: 'black', pgn: PGN, clock: { initial: 180, increment: 2 } },
  { id: 'efgh5678', variant: 'atomic', speed: 'blitz', status: 'mate', createdAt: 1, lastMoveAt: 2, players: { white: {}, black: {} }, pgn: PGN }
].map(function (g) { return JSON.stringify(g); }).join('\n') + '\n';
var li = fakeFetch({ 'https://lichess.org/api/games/user/demo_user': LI });

// Benutzername aus Profil-Links und „@name“
eq(CN.normalizeUser('chesscom', 'https://www.chess.com/member/Demo_User'), 'Demo_User', 'chess.com-Profillink → Name');
eq(CN.normalizeUser('chesscom', 'chess.com/de/member/demo_user?ref=x'), 'demo_user', 'chess.com-Link mit Sprache und Parameter');
eq(CN.normalizeUser('chesscom', ' @Demo_User '), 'Demo_User', '„@name“ und Leerzeichen');
eq(CN.normalizeUser('lichess', 'https://lichess.org/@/demo_user/all'), 'demo_user', 'lichess-Profillink → Name');

Promise.all([
  CN.fetchGames('chesscom', 'https://www.chess.com/member/Demo_User', { limit: 10 }, cc).then(function (games) {
    eq(games.length, 2, 'chess.com: Profillink funktioniert wie der Name');
  }),
  CN.fetchGames('chesscom', 'Max Mustermann', {}, cc).then(function () { ok(false, 'Leerzeichen im Namen sollte fehlschlagen'); },
    function (e) { eq(e.code, 'badname', 'ungültiger Benutzername abgefangen'); }),
  CN.fetchGames('chesscom', 'Demo_User', { limit: 10 }, cc).then(function (games) {
    eq(games.length, 2, 'chess.com: nur Standardschach');
    eq(games[0].id, 'u2', 'chess.com: neueste zuerst');
    eq(games[0].result, '0-1', 'chess.com: Ergebnis');
    eq(games[0].userColor, 'w', 'chess.com: Farbe des Benutzers (Groß/Klein egal)');
    eq(games[0].userResult, 'loss', 'chess.com: Niederlage erkannt');
    eq(games[1].userResult, 'draw', 'chess.com: Remis erkannt');
    ok(cc.calls.every(function (c) { return /\/games\/archives$|\/games\/\d{4}\/\d{2}$/.test(c.url); }), 'chess.com: nur Archive (beendete Partien) abgefragt');
  }),
  CN.fetchGames('lichess', 'demo_user', { limit: 5 }, li).then(function (games) {
    eq(games.length, 1, 'lichess: nur Standardschach');
    eq(games[0].userColor, 'b', 'lichess: Farbe');
    eq(games[0].userResult, 'win', 'lichess: Sieg');
    eq(games[0].timeControl, '180+2', 'lichess: Bedenkzeit');
    var u = li.calls[0].url;
    ok(/finished=true/.test(u) && /ongoing=false/.test(u), 'lichess: nur beendete Partien angefragt');
    eq(li.calls[0].opts.headers.Accept, 'application/x-ndjson', 'lichess: NDJSON angefragt');
  }),
  CN.fetchGames('lichess', 'niemand', {}, fakeFetch({})).then(function () { ok(false, '404 sollte fehlschlagen'); },
    function (e) { eq(e.code, 'notfound', '404 → Benutzer nicht gefunden'); }),
  CN.fetchGames('chesscom', '  ', {}, cc).then(function () { ok(false, 'leerer Name sollte fehlschlagen'); },
    function (e) { eq(e.code, 'input', 'leerer Benutzername abgefangen'); }),
  CN.fetchGames('lichess', 'xy', {}, fakeFetch({ 'https://lichess.org/': 'NETWORK' })).then(function () { ok(false, 'Netzfehler sollte fehlschlagen'); },
    function (e) { eq(e.code, 'network', 'Netzfehler nach Wiederholungen gemeldet'); }),
  (function () {
    // chess.com liefert zweimal einen Netzfehler (fehlender CORS-Header), dann klappt es
    var n = 0, flaky = function (url, opts) {
      n++;
      if (n <= 2) return Promise.reject(new TypeError('Failed to fetch'));
      return cc(url, opts);
    };
    return CN.fetchGames('chesscom', 'demo_user', { limit: 5 }, flaky).then(function (games) {
      eq(games.length, 2, 'chess.com: wackelige Verbindung wird durch Wiederholung überbrückt');
    });
  })()
]).then(function () {
  console.log((fail ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
});
