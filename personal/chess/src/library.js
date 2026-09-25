/* SK.library – lokal gespeicherte Partien mit ihrer Analyse (Grundlage für Insights und Trainer).
   SK.srs – Taktik-Trainer mit Wiederholung in wachsenden Abständen (Leitner-System).
   Beides liegt nur im Browser (localStorage), nichts verlässt das Gerät. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var mem = {};
  function load(k, def) {
    try { var v = root.localStorage && root.localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* egal */ }
    return mem[k] !== undefined ? mem[k] : def;
  }
  function store(k, v) {
    mem[k] = v;
    try { if (root.localStorage) root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function now() { return root.SK._now ? root.SK._now() : Date.now(); }
  var DAY = 86400000;

  /* ---------- Bibliothek ---------- */

  var LIB = 'zugradar.library.v1', MAX_GAMES = 200;

  // Kurzer, stabiler Hash für PGN-Importe ohne Plattform-ID
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function movesOnly(pgn) { return String(pgn || '').replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim(); }

  function all() {
    var list = load(LIB, []);
    return Array.isArray(list) ? list : [];
  }
  function get(id) { return all().filter(function (g) { return g.id === id; })[0] || null; }
  function put(entry) {
    var list = all().filter(function (g) { return g.id !== entry.id; });
    entry.saved = now();
    list.push(entry);
    list.sort(function (a, b) { return (b.end || b.saved) - (a.end || a.saved); });
    if (list.length > MAX_GAMES) list = list.slice(0, MAX_GAMES);
    // Speicher voll → älteste Analysen verwerfen, bis es passt
    while (!store(LIB, list) && list.length > 10) list = list.slice(0, Math.floor(list.length * 0.8));
    return entry;
  }
  function remove(id) { store(LIB, all().filter(function (g) { return g.id !== id; })); }
  function clear() { store(LIB, []); }

  // Eintrag aus einer Konnektor-Partie oder einer eingefügten PGN
  function entryFrom(g, pgn, headers) {
    headers = headers || {};
    var id = g && g.site && g.id ? g.site + ':' + g.id : 'pgn:' + hash(movesOnly(pgn));
    return {
      id: id, site: g && g.site || 'pgn', url: g && g.url || '', pgn: pgn,
      end: g && g.end || Date.parse((headers.Date || '').replace(/\./g, '-')) || now(),
      white: g && g.white || { name: headers.White || '?', rating: +headers.WhiteElo || null },
      black: g && g.black || { name: headers.Black || '?', rating: +headers.BlackElo || null },
      result: g && g.result || headers.Result || '*',
      userColor: g && g.userColor || null, userResult: g && g.userResult || null,
      timeControl: g && g.timeControl || headers.TimeControl || null, speed: g && g.speed || null,
      opening: null, analysis: null
    };
  }

  /* ---------- Taktik-Trainer (Spaced Repetition) ---------- */

  var SRS = 'zugradar.srs.v1', MAX_PUZZLES = 1000;
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // Tage je Kasten

  function puzzles() { var l = load(SRS, []); return Array.isArray(l) ? l : []; }
  function savePuzzles(l) {
    if (l.length > MAX_PUZZLES) {
      // gelernte (hoher Kasten) zuerst verwerfen
      l.sort(function (a, b) { return a.box - b.box || b.added - a.added; });
      l = l.slice(0, MAX_PUZZLES);
    }
    store(SRS, l);
  }
  // p = { id, fen, bestUci, played:{uci, san, color, fenBefore}, key, wpBefore, tags, gameId, label }
  function addPuzzles(list) {
    var cur = puzzles(), ids = {}, added = 0;
    cur.forEach(function (p) { ids[p.id] = true; });
    list.forEach(function (p) {
      if (!p || !p.id || ids[p.id]) return;
      ids[p.id] = true; added++;
      cur.push(Object.assign({ box: 0, due: now(), seen: 0, right: 0, added: now() }, p));
    });
    if (added) savePuzzles(cur);
    return added;
  }
  function due(t) {
    t = t || now();
    return puzzles().filter(function (p) { return p.due <= t; })
      .sort(function (a, b) { return a.box - b.box || a.due - b.due; });
  }
  // correct = beim ersten Versuch gelöst
  function answer(id, correct) {
    var l = puzzles(), p = l.filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    p.seen++;
    if (correct) {
      p.right++;
      p.box = Math.min(INTERVALS.length - 1, p.box + 1);
      p.due = now() + INTERVALS[p.box] * DAY;
    } else {
      p.box = 0;
      p.due = now() + 10 * 60000; // in 10 Minuten nochmal
    }
    savePuzzles(l);
    return p;
  }
  function stats(t) {
    t = t || now();
    var l = puzzles();
    return {
      total: l.length,
      due: l.filter(function (p) { return p.due <= t; }).length,
      learned: l.filter(function (p) { return p.box >= 4; }).length,
      seen: l.filter(function (p) { return p.seen > 0; }).length
    };
  }
  function removePuzzle(id) { savePuzzles(puzzles().filter(function (p) { return p.id !== id; })); }
  function clearPuzzles() { store(SRS, []); }

  root.SK.library = { all: all, get: get, put: put, remove: remove, clear: clear, entryFrom: entryFrom, hash: hash };
  root.SK.srs = { INTERVALS: INTERVALS, all: puzzles, add: addPuzzles, due: due, answer: answer, stats: stats,
                  remove: removePuzzle, clear: clearPuzzles };
})();
if (typeof module !== 'undefined') module.exports = { library: (typeof window !== 'undefined' ? window : globalThis).SK.library, srs: (typeof window !== 'undefined' ? window : globalThis).SK.srs };
