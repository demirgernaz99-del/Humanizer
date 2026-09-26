/* SK.pgnFile – PGN-Dateien mit vielen Partien (Turniere, Vereinsabende, ChessBase-Export):
   in einzelne Partien trennen, Kopfzeilen lesen, Spieler zählen. Reine Textverarbeitung, in Node testbar. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var HEADER = /^\s*\[(\w+)\s+"(.*)"\]\s*$/;
  var RESULT_END = /(1-0|0-1|1\/2-1\/2|\*)\s*$/;

  // Text → Liste von PGN-Texten (eine je Partie)
  function split(text) {
    var lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var games = [], cur = [], hasMoves = false, ended = false;
    function push() {
      var t = cur.join('\n').trim();
      if (t) games.push(t);
      cur = []; hasMoves = false; ended = false;
    }
    lines.forEach(function (l) {
      var trimmed = l.trim();
      if (HEADER.test(l)) {
        if (hasMoves) push();           // neue Kopfzeilen nach Zügen = neue Partie
        cur.push(l);
        return;
      }
      if (!trimmed) { if (cur.length) cur.push(l); return; }
      // Partien ohne Kopfzeilen: nach einem Ergebnis beginnt mit „1.“ die nächste
      if (ended && /^1\.\s*\S/.test(trimmed)) push();
      cur.push(l);
      hasMoves = true;
      ended = RESULT_END.test(trimmed);
    });
    push();
    return games;
  }

  function headers(pgn) {
    var h = {};
    String(pgn || '').split('\n').forEach(function (l) {
      var m = HEADER.exec(l);
      if (m) h[m[1]] = m[2];
    });
    return h;
  }

  // Wer kommt am häufigsten vor? → [{ name, n }] absteigend (das ist meist der Besitzer der Datei)
  function players(pgns) {
    var cnt = {};
    pgns.forEach(function (p) {
      var h = headers(p);
      [h.White, h.Black].forEach(function (n) { if (n && n !== '?') cnt[n] = (cnt[n] || 0) + 1; });
    });
    return Object.keys(cnt).map(function (n) { return { name: n, n: cnt[n] }; })
      .sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
  }

  // Datum aus der PGN-Kopfzeile ("2026.09.14", "2026.09.??") → Zeitstempel oder null
  function dateOf(h) {
    var m = /^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)/.exec((h && h.Date) || '');
    if (!m) return null;
    return Date.UTC(+m[1], m[2] === '??' ? 0 : +m[2] - 1, m[3] === '??' ? 1 : +m[3], 12);
  }

  root.SK.pgnFile = { split: split, headers: headers, players: players, dateOf: dateOf };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.pgnFile;
