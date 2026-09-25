/* SK.insights – macht aus analysierten Partien ein Spielerprofil: Genauigkeit und Trend,
   Phasen, Uhr, Eröffnungen, Fehlermuster und die wichtigsten Baustellen mit Trainingstipps.
   Reine Logik (in Node testbar); die Oberfläche übersetzt die IDs in Text. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var CL = null, CO = null, BK = null;
  if (typeof module !== 'undefined' && typeof require === 'function') {
    try { CL = require('./classify.js'); CO = require('./coach.js'); BK = require('./openings.js'); } catch (e) { CL = null; }
  }
  function C() { return CL || root.SK.classify; }
  function coach() { return CO || root.SK.coach; }
  function book() { return BK || root.SK.book; }

  var START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  function posKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }

  /* Eine Partie auswerten. moves: Züge wie in der App (fenBefore, fenAfter, from, to, promotion, san, uci,
     color, piece, captured, flags, legalCount, inCheck, clock, spent). lookup(fen) → Engine-Analyse.
     Liefert null, solange eine Stellung fehlt. */
  function analyzeGame(moves, lookup, opts) {
    opts = opts || {};
    var minDepth = opts.minDepth || 10;
    var out = [], prev = null, chain = moves.length && posKey(moves[0].fenBefore) === START_KEY;
    var tc = coach().parseTimeControl(opts.timeControl);
    var fensBook = moves.length ? [moves[0].fenBefore] : [];
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var eb = lookup(mv.fenBefore), ea = lookup(mv.fenAfter);
      var term = opts.terminal ? opts.terminal(mv.fenAfter) : null;
      var after = term ? { terminal: term, lines: [], depth: 99 } : ea;
      if (mv.legalCount > 1 && (!eb || eb.depth < minDepth || !eb.lines.length)) return null;
      if (!after || (!after.terminal && after.depth < minDepth - 2)) {
        if (!(eb && eb.lines.some(function (l) { return l.uci === mv.uci; }))) return null;
      }
      var phase = coach().phaseOf(mv.fenBefore, chain && i > 0);
      chain = chain && !!book().lookup(mv.fenAfter);
      if (chain) fensBook.push(mv.fenAfter);
      var prevLoss = prev && prev.loss != null ? Math.round(prev.loss) : null;
      var r = C().classifyMove({ fenBefore: mv.fenBefore, move: mv, before: eb, after: after, legalCount: mv.legalCount,
        inCheck: mv.inCheck, prevLoss: prevLoss, lastMove: i ? moves[i - 1] : null, inBook: chain });
      if (!r) return null;
      var tags = coach().tagsFor({ fenBefore: mv.fenBefore, fenAfter: mv.fenAfter, move: mv, cls: r, after: ea,
        notation: 'en', clock: { left: mv.clock, spent: mv.spent }, base: tc ? tc.base : null });
      out.push({ san: mv.san, uci: mv.uci, color: mv.color, key: r.key, loss: r.loss == null ? null : Math.round(r.loss * 10) / 10,
                 acc: r.accuracy == null ? null : Math.round(r.accuracy * 10) / 10, wpBefore: r.wpBefore,
                 phase: phase, clock: mv.clock == null ? null : mv.clock, spent: mv.spent == null ? null : mv.spent,
                 tags: tags, bestUci: r.bestUci, fenBefore: mv.fenBefore });
      prev = r;
    }
    var sum = C().summarize(out.map(function (m) { return { color: m.color, cls: { key: m.key, accuracy: m.acc, wpBefore: m.wpBefore } }; }));
    return {
      depth: opts.depth || minDepth, at: Date.now(),
      opening: book().nameFor(fensBook),
      acc: { w: sum.w.accuracy, b: sum.b.accuracy },
      moves: out.map(function (m) { var c = Object.assign({}, m); delete c.fenBefore; delete c.bestUci; delete c.wpBefore; return c; }),
      puzzles: puzzlesFrom(out, opts.gameId, opts.userColor)
    };
  }

  // Aufgaben für den Trainer: eigene Fehler, Patzer, verpasste Chancen mit bekanntem besserem Zug
  function puzzlesFrom(moves, gameId, color) {
    var list = [];
    moves.forEach(function (m, i) {
      if (color && m.color !== color) return;
      if (!/mistake|blunder|miss/.test(m.key) || !m.bestUci || !m.fenBefore) return;
      list.push({ id: (gameId || 'g') + ':' + i, fen: m.fenBefore, bestUci: m.bestUci, key: m.key, wpBefore: m.wpBefore,
                  played: { uci: m.uci, san: m.san, color: m.color, fenBefore: m.fenBefore }, tags: m.tags, gameId: gameId || null });
    });
    return list;
  }

  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  /* Profil über viele Partien. entries: Bibliothekseinträge mit analysis und userColor. */
  function aggregate(entries) {
    var games = entries.filter(function (e) { return e.analysis && e.userColor; })
      .sort(function (a, b) { return a.end - b.end; });
    var res = { n: games.length, wins: 0, draws: 0, losses: 0, score: null, acc: null, trend: [],
                phases: { opening: [], middlegame: [], endgame: [] }, byColor: { w: { n: 0, pts: 0, acc: [] }, b: { n: 0, pts: 0, acc: [] } },
                perGame: { blunder: 0, mistake: 0, miss: 0, inaccuracy: 0 }, highlights: { brilliant: 0, great: 0 },
                errors: 0, tags: {}, time: { errors: 0, pressure: 0, fast: 0, withClock: 0 }, openings: [] };
    var accs = [], openings = {};
    games.forEach(function (g) {
      var me = g.userColor, a = g.analysis;
      var pts = g.userResult === 'win' ? 1 : g.userResult === 'draw' ? 0.5 : g.userResult === 'loss' ? 0 : null;
      if (g.userResult === 'win') res.wins++; else if (g.userResult === 'draw') res.draws++; else if (g.userResult === 'loss') res.losses++;
      var acc = a.acc ? a.acc[me] : null;
      if (acc != null) accs.push(acc);
      res.trend.push({ id: g.id, end: g.end, acc: acc, result: g.userResult, opp: me === 'w' ? g.black : g.white });
      var bc = res.byColor[me];
      bc.n++; if (pts != null) bc.pts += pts; if (acc != null) bc.acc.push(acc);
      var hasClock = false;
      a.moves.forEach(function (m) {
        if (m.color !== me) return;
        if (m.clock != null) hasClock = true;
        if (m.acc != null && res.phases[m.phase]) res.phases[m.phase].push(m.acc);
        if (res.perGame[m.key] != null) res.perGame[m.key]++;
        if (res.highlights[m.key] != null) res.highlights[m.key]++;
        if (/mistake|blunder|miss/.test(m.key)) {
          res.errors++;
          (m.tags || []).forEach(function (t) { res.tags[t] = (res.tags[t] || 0) + 1; });
          if (m.clock != null) {
            res.time.errors++;
            if ((m.tags || []).indexOf('time_trouble') >= 0) res.time.pressure++;
            if ((m.tags || []).indexOf('fast') >= 0) res.time.fast++;
          }
        }
      });
      if (hasClock) res.time.withClock++;
      var on = a.opening || '—';
      var ok = on + '|' + me;
      var o = openings[ok] || (openings[ok] = { name: on, color: me, n: 0, pts: 0, acc: [] });
      o.n++; if (pts != null) o.pts += pts; if (acc != null) o.acc.push(acc);
    });
    var n = games.length;
    if (n) {
      res.score = (res.wins + res.draws * 0.5) / n;
      res.acc = mean(accs);
      Object.keys(res.perGame).forEach(function (k) { res.perGame[k] = res.perGame[k] / n; });
    }
    ['opening', 'middlegame', 'endgame'].forEach(function (p) {
      var arr = res.phases[p];
      res.phases[p] = { acc: mean(arr), n: arr.length };
    });
    ['w', 'b'].forEach(function (c) {
      var x = res.byColor[c];
      res.byColor[c] = { n: x.n, score: x.n ? x.pts / x.n : null, acc: mean(x.acc) };
    });
    res.openings = Object.keys(openings).map(function (k) {
      var o = openings[k];
      return { name: o.name, color: o.color, n: o.n, score: o.pts / o.n, acc: mean(o.acc) };
    }).sort(function (a, b) { return b.n - a.n || b.score - a.score; });
    // gleitender Trend: Durchschnitt der letzten 5 Partien gegenüber den 5 davor
    var la = accs.slice(-5), pa = accs.slice(-10, -5);
    res.trendDelta = la.length >= 3 && pa.length >= 3 ? mean(la) - mean(pa) : null;
    res.weaknesses = weaknesses(res);
    res.strengths = strengths(res);
    return res;
  }

  /* Die wichtigsten Baustellen (id + Kennzahlen); die Oberfläche macht daraus Tipps. */
  function weaknesses(r) {
    var out = [], e = r.errors;
    function share(t) { return e ? (r.tags[t] || 0) / e : 0; }
    if (e >= 3) {
      if (share('hanging') >= 0.2) out.push({ id: 'hanging', severity: share('hanging'), count: r.tags.hanging, of: e });
      var missed = (r.tags.win_missed || 0) + (r.tags.fork_missed || 0) + (r.tags.mate_missed || 0);
      if (missed / e >= 0.25) out.push({ id: 'tactics_missed', severity: missed / e * 0.9, count: missed, of: e });
      if (share('mate_allowed') >= 0.1) out.push({ id: 'mate_allowed', severity: share('mate_allowed') * 1.2, count: r.tags.mate_allowed, of: e });
      if (share('fork_allowed') >= 0.12) out.push({ id: 'fork_allowed', severity: share('fork_allowed'), count: r.tags.fork_allowed, of: e });
    }
    if (r.time.errors >= 3) {
      var p = r.time.pressure / r.time.errors, f = r.time.fast / r.time.errors;
      if (p >= 0.25) out.push({ id: 'time_trouble', severity: p, count: r.time.pressure, of: r.time.errors });
      if (f >= 0.25) out.push({ id: 'too_fast', severity: f, count: r.time.fast, of: r.time.errors });
    }
    var ph = r.phases, overall = r.acc;
    if (overall != null && ph.endgame.n >= 10 && ph.endgame.acc != null && ph.endgame.acc < overall - 4) {
      out.push({ id: 'endgame', severity: Math.min(1, (overall - ph.endgame.acc) / 20), acc: ph.endgame.acc, overall: overall });
    }
    if (overall != null && ph.opening.n >= 10 && ph.opening.acc != null && ph.opening.acc < overall - 4) {
      out.push({ id: 'opening_phase', severity: Math.min(1, (overall - ph.opening.acc) / 20), acc: ph.opening.acc, overall: overall });
    }
    var worst = r.openings.filter(function (o) { return o.n >= 3 && o.name !== '—'; }).sort(function (a, b) { return a.score - b.score; })[0];
    if (worst && worst.score < 0.4) out.push({ id: 'opening', severity: (0.5 - worst.score) * 1.2, name: worst.name, color: worst.color, n: worst.n, score: worst.score });
    if (r.n >= 3 && r.perGame.blunder >= 1) out.push({ id: 'blunders', severity: Math.min(1, r.perGame.blunder / 2.5), perGame: r.perGame.blunder });
    return out.sort(function (a, b) { return b.severity - a.severity; }).slice(0, 3);
  }

  function strengths(r) {
    var out = [];
    var ph = r.phases, best = null;
    ['opening', 'middlegame', 'endgame'].forEach(function (p) {
      if (ph[p].n >= 8 && ph[p].acc != null && (!best || ph[p].acc > ph[best].acc)) best = p;
    });
    if (best && r.acc != null && ph[best].acc >= r.acc + 2) out.push({ id: 'phase', phase: best, acc: ph[best].acc });
    var top = r.openings.filter(function (o) { return o.n >= 3 && o.name !== '—'; }).sort(function (a, b) { return b.score - a.score; })[0];
    if (top && top.score >= 0.6) out.push({ id: 'opening', name: top.name, color: top.color, score: top.score, n: top.n });
    if (r.highlights.brilliant) out.push({ id: 'brilliant', count: r.highlights.brilliant });
    return out;
  }

  root.SK.insights = { analyzeGame: analyzeGame, aggregate: aggregate, weaknesses: weaknesses, puzzlesFrom: puzzlesFrom };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.insights;
