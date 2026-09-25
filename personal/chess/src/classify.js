/* SK.classify – Zugbewertung wie in Game-Review-Tools.
   Eingabe: Stockfish-Analyse der Stellung vor und nach dem Zug. Ausgabe: Kategorie
   (brillant, großartig, bester Zug … Patzer), Verlust an Gewinnchance, Genauigkeit.
   Reine Logik ohne DOM, damit sie in Node getestet werden kann. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var lib = null;
  if (typeof module !== 'undefined' && typeof require === 'function') {
    try { lib = require('./vendor/chess.js'); } catch (e) { lib = null; }
  }
  function Chess(fen) { var L = lib || root.SK.ChessLib; return new L.Chess(fen); }

  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // Reihenfolge = Anzeige-Reihenfolge in der Review-Tabelle
  var CATS = {
    brilliant:  { label: 'Brillant',      short: 'Brillant',   sym: '!!', nag: '!!' },
    great:      { label: 'Großartig',     short: 'Großartig',  sym: '!',  nag: '!' },
    best:       { label: 'Bester Zug',    short: 'Bester',     sym: '★',  nag: '' },
    excellent:  { label: 'Exzellent',     short: 'Exzellent',  sym: '✓✓', nag: '' },
    good:       { label: 'Gut',           short: 'Gut',        sym: '✓',  nag: '' },
    book:       { label: 'Theorie',       short: 'Theorie',    sym: 'T',  nag: '' },
    forced:     { label: 'Erzwungen',     short: 'Erzwungen',  sym: '→',  nag: '' },
    inaccuracy: { label: 'Ungenauigkeit', short: 'Ungenau',    sym: '?!', nag: '?!' },
    mistake:    { label: 'Fehler',        short: 'Fehler',     sym: '?',  nag: '?' },
    miss:       { label: 'Verpasst',      short: 'Verpasst',   sym: '✕',  nag: '?' },
    blunder:    { label: 'Patzer',        short: 'Patzer',     sym: '??', nag: '??' }
  };
  var ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced',
               'inaccuracy', 'mistake', 'miss', 'blunder'];

  // Schwellen in Prozentpunkten Gewinnchance (Verlust gegenüber dem besten Zug)
  var T = {
    best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20,
    greatGap: 20,        // bester Zug muss so viel besser sein als der zweitbeste
    greatMinWp: 25,      // „großartig“ nur, wenn man danach nicht trotzdem verloren ist
    brilliantMinWp: 45,  // nach dem Opfer darf man nicht schlechter stehen
    brilliantMaxAlt: 95, // mit dem zweitbesten Zug wäre man nicht ohnehin völlig auf Gewinn
    sacMin: 2,           // mindestens Qualität bzw. Figur gegen Bauer
    compMin: 1.5,        // Bewertung minus Material nach Annahme des Opfers (in Bauern)
    winWp: 63.5          // ≈ +1,5 Bauern: ab hier gilt eine Stellung als gewonnen
  };

  /* ---------- Bewertung → Gewinnchance ---------- */

  // Lichess-Formel: Centipawns (Sicht des Ziehenden) → Gewinnchance 0..100
  function cpToWp(cp) {
    var c = Math.max(-1000, Math.min(1000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  }
  // score = {cp} | {mate}; aus Sicht der Seite am Zug
  function scoreWp(s) {
    if (!s) return null;
    if (s.mate != null) return s.mate > 0 ? 100 : 0;
    return cpToWp(s.cp);
  }
  function negate(s) {
    if (!s) return null;
    if (s.mate != null) return { mate: -s.mate };
    return { cp: -s.cp };
  }
  // Anzeige: +1.70 / −0.35 / #3 / #-2
  function fmtScore(s) {
    if (!s) return '…';
    if (s.mate != null) {
      if (s.mate === 0) return '#';
      return (s.mate > 0 ? '#' : '#-') + Math.abs(s.mate);
    }
    var v = s.cp / 100;
    var t = Math.abs(v).toFixed(2);
    return (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + t;
  }
  function scorePawns(s) {
    if (!s) return 0;
    if (s.mate != null) return s.mate > 0 ? 100 : -100;
    return s.cp / 100;
  }

  // Genauigkeit eines Zuges (Lichess-Kurve), 0..100
  function moveAccuracy(wpBefore, wpAfter) {
    var d = Math.max(0, wpBefore - wpAfter);
    var a = 103.1668 * Math.exp(-0.04354 * d) - 3.1669;
    return Math.max(0, Math.min(100, a));
  }

  /* ---------- Material & Abtauschbilanz (SEE) ---------- */

  function material(chess, color) {
    var b = chess.board(), s = 0;
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b[r][f];
      if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
    }
    return s;
  }

  // Nettogewinn der Seite am Zug, wenn sie auf `sq` schlägt und beide Seiten mit der
  // jeweils billigsten Figur zurückschlagen (jede Seite darf aufhören). Nur legale Züge,
  // d. h. Fesselungen und Schachgebote werden berücksichtigt.
  function see(chess, sq, depth) {
    depth = depth || 0;
    var target = chess.get(sq);
    if (!target || target.type === 'k' || depth > 12) return 0;
    var caps = chess.moves({ verbose: true }).filter(function (m) {
      return m.to === sq && m.captured && m.flags.indexOf('e') < 0;
    });
    if (!caps.length) return 0;
    caps.sort(function (a, b) { return VAL[a.piece] - VAL[b.piece]; });
    var m = caps[0];
    var promo = m.promotion ? 'q' : undefined;
    chess.move({ from: m.from, to: m.to, promotion: promo });
    var gain = VAL[target.type] + (promo ? VAL.q - VAL.p : 0) - see(chess, sq, depth + 1);
    chess.undo();
    return Math.max(0, gain);
  }

  // Größte Figur von `color`, die die Seite am Zug gewinnbringend schlagen kann.
  function hanging(chess, color, skip) {
    var best = { value: 0, square: null, piece: null };
    var b = chess.board();
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b[r][f];
      if (!p || p.color !== color || p.type === 'k' || p.type === 'p') continue;
      var sq = 'abcdefgh'[f] + (8 - r);
      if (skip && skip === sq) continue;
      var v = see(chess, sq);
      if (v > best.value) best = { value: v, square: sq, piece: p.type };
    }
    return best;
  }

  // Stellung mit gewechseltem Zugrecht (Nullzug), um Drohungen zu messen.
  function nullMove(fen) {
    var parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    var c = Chess();
    try { c.load(parts.join(' '), { skipValidation: true }); } catch (e) { return null; }
    return c;
  }

  /* Opfer-Erkennung: Nach dem Zug kann der Gegner Material gewinnen (SEE ≥ 2 netto),
     Stockfish hält den Zug trotzdem für (fast) den besten und die Bewertung liegt
     deutlich über dem, was das Material nach Annahme des Opfers hergibt.
     Gezählt wird nur Material, das durch diesen Zug NEU angeboten wird – eine Figur,
     die schon vorher hing, gehört zu einem früheren Opfer (oder zu einer Gabel). */
  function detectSacrifice(fenBefore, mv, playedScoreMover) {
    var before = Chess(fenBefore);
    var mover = before.turn();
    var opp = mover === 'w' ? 'b' : 'w';
    var after = Chess(fenBefore);
    var made;
    try { made = after.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); } catch (e) { return null; }
    if (!made) return null;
    var captured = made.captured ? VAL[made.captured] : 0;
    var pre = nullMove(fenBefore); // Gegner am Zug in der Ausgangsstellung

    var best = null;
    var b = after.board();
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b[r][f];
      if (!p || p.color !== mover || p.type === 'k' || p.type === 'p') continue;
      var sq = 'abcdefgh'[f] + (8 - r);
      if (made.promotion && sq === made.to) continue;
      var v = see(after, sq);
      if (v <= 0) continue;
      var origin = sq === made.to ? made.from : sq;
      var was = pre ? see(pre, origin) : 0;
      var eff = v - was;
      if (!best || eff > best.eff) best = { eff: eff, value: v, square: sq, piece: p.type };
    }
    if (!best) return null;
    var sac = best.eff - captured;
    if (sac < T.sacMin) return null;

    // Nimmt der Gegner an, kann man dann sofort gleich viel Material zurückgewinnen
    // (Gegenangriff auf eine andere Figur)? Dann ist es eher ein Abtausch als ein Opfer.
    var takes = after.moves({ verbose: true }).filter(function (m) {
      return m.to === best.square && m.captured;
    }).sort(function (a, b) { return VAL[a.piece] - VAL[b.piece]; });
    if (takes.length) {
      after.move({ from: takes[0].from, to: takes[0].to, promotion: takes[0].promotion ? 'q' : undefined });
      var counter = hanging(after, opp, best.square);
      after.undo();
      if (counter.value >= best.value) return null;
    }

    var matAfter = material(after, mover) - best.value; // Material, wenn der Gegner annimmt
    var comp = scorePawns(playedScoreMover) - matAfter;
    if (comp < T.compMin) return null;

    return { amount: sac, square: best.square, piece: best.piece, compensation: comp };
  }

  /* ---------- Hauptfunktion ---------- */

  // Ergebnis-Klasse: 1 = Gewinn (≥ +1,5), 0 = offen, −1 = Verlust
  function outcome(wp) { return wp >= T.winWp ? 1 : (wp <= 100 - T.winWp ? -1 : 0); }

  function uciOf(m) { return m.from + m.to + (m.promotion || ''); }
  function findLine(lines, uci) {
    for (var i = 0; i < (lines || []).length; i++) if (lines[i].uci === uci) return i;
    return -1;
  }
  function mateLen(s) { return s && s.mate != null ? s.mate : null; }

  /* ctx = {
       fenBefore, move:{from,to,promotion,san,piece,captured,flags},
       before: {depth, lines:[{uci, score, pv}]}   // Stellung vor dem Zug (Seite am Zug = Ziehender)
       after:  {depth, lines:[...], terminal:'mate'|'draw'|null} // Stellung nach dem Zug
       legalCount, prevLoss (Verlust des gegnerischen Vorzugs, für „Verpasst“),
       lastMove (gegnerischer Vorzug, für Rückschlag-Erkennung), inBook
     } */
  function classifyMove(ctx) {
    var mv = ctx.move, uci = uciOf(mv);
    var before = ctx.before, after = ctx.after;
    var res = { key: null, loss: null, wpBefore: null, wpAfter: null, accuracy: null,
                bestUci: null, bestScore: null, playedScore: null, secondScore: null,
                sac: null, reasons: [] };

    if (ctx.legalCount === 1) {
      res.key = 'forced'; res.loss = 0;
      if (before && before.lines && before.lines[0]) {
        res.bestUci = before.lines[0].uci; res.bestScore = before.lines[0].score;
        res.wpBefore = res.wpAfter = scoreWp(before.lines[0].score);
        res.playedScore = before.lines[0].score;
      }
      res.accuracy = 100;
      return res;
    }
    if (!before || !before.lines || !before.lines.length) return null;

    var best = before.lines[0];
    res.bestUci = best.uci; res.bestScore = best.score;
    var bestWp = scoreWp(best.score);

    // Bewertung des gespielten Zuges aus Sicht des Ziehenden
    var playedScore = null, idx = findLine(before.lines, uci);
    if (after && after.terminal === 'mate') playedScore = { mate: 1 };
    else if (after && after.terminal === 'draw') playedScore = { cp: 0 };
    else if (idx >= 0) playedScore = before.lines[idx].score;
    else if (after && after.lines && after.lines.length) playedScore = negate(after.lines[0].score);
    if (!playedScore) return null;
    res.playedScore = playedScore;

    var playedWp = scoreWp(playedScore);
    // Tiefere Analyse der Folgestellung kann besser sein als die Vorhersage → kein negativer Verlust
    var loss = Math.max(0, bestWp - playedWp);
    if (idx === 0) loss = 0;
    res.loss = loss; res.wpBefore = bestWp;
    res.wpAfter = idx === 0 ? bestWp : playedWp;
    res.accuracy = moveAccuracy(bestWp, idx === 0 ? bestWp : playedWp);

    var second = before.lines[1] || null;
    var secondWp = second ? scoreWp(second.score) : null;
    res.secondScore = second ? second.score : null;

    // Grundkategorie aus dem Verlust
    var key;
    if (idx === 0 || loss <= T.best) key = 'best';
    else if (loss < T.excellent) key = 'excellent';
    else if (loss < T.good) key = 'good';
    else if (loss < T.inaccuracy) key = 'inaccuracy';
    else if (loss < T.mistake) key = 'mistake';
    else key = 'blunder';

    // Matt-Sonderfälle
    var bm = mateLen(best.score), pm = mateLen(playedScore);
    if (bm != null && bm > 0) {
      if (pm != null && pm > 0) {
        key = (idx === 0 || pm <= bm) ? 'best' : (pm <= bm + 3 ? 'excellent' : 'good');
      } else if (bm <= 3 && (key !== 'blunder' || playedWp >= 50)) {
        // Matt ausgelassen, aber noch gut dabei → „Verpasst“; wer danach schlecht steht, hat gepatzt
        key = 'miss'; res.reasons.push('Matt in ' + bm + ' ausgelassen');
      }
    }

    // „Verpasst“: Gegner hat gerade gepatzt, die Chance wurde nicht genutzt
    if ((key === 'inaccuracy' || key === 'mistake') && ctx.prevLoss != null && ctx.prevLoss >= T.inaccuracy && loss >= 7) {
      key = 'miss'; res.reasons.push('Fehler des Gegners nicht bestraft');
    }

    // Theorie
    if (ctx.inBook && loss < T.inaccuracy) key = 'book';

    // Brillant: (fast) bester Zug mit echtem Materialopfer
    if ((key === 'best' || key === 'excellent') && playedWp >= T.brilliantMinWp &&
        (secondWp == null || secondWp < T.brilliantMaxAlt)) {
      var sac = detectSacrifice(ctx.fenBefore, mv, playedScore);
      if (sac) { key = 'brilliant'; res.sac = sac; }
    }

    // Großartig: der einzige Zug, der das Ergebnis hält bzw. kippt (Gewinn/Ausgleich/Verlust)
    // und nicht offensichtlich ist. Mattsetzen selbst zählt als „Bester Zug“.
    if (key === 'best' && second && secondWp != null && bestWp - secondWp >= T.greatGap &&
        bestWp >= T.greatMinWp && outcome(bestWp) > outcome(secondWp) && !(after && after.terminal === 'mate')) {
      var obvious = false;
      var lm = ctx.lastMove;
      if (lm && lm.captured && mv.captured && lm.to === mv.to) { obvious = true; res.reasons.push('Rückschlag'); }
      if (!obvious && mv.captured) {
        var c = Chess(ctx.fenBefore);
        try { c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); } catch (e) { c = null; }
        if (c && VAL[mv.captured] - see(c, mv.to) >= T.sacMin) { obvious = true; res.reasons.push('freies Material'); }
      }
      if (!obvious && ctx.inCheck) { obvious = true; res.reasons.push('Schachabwehr'); }
      if (!obvious) key = 'great';
    }

    res.key = key;
    return res;
  }

  /* ---------- Partie-Zusammenfassung ---------- */

  function stdev(a) {
    if (a.length < 2) return 0;
    var m = a.reduce(function (s, x) { return s + x; }, 0) / a.length;
    var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / a.length;
    return Math.sqrt(v);
  }

  /* moves: [{color:'w'|'b', cls:{key, accuracy, wpBefore, wpAfter}}] (cls darf null sein)
     → { w:{counts, accuracy, n}, b:{...} }  Genauigkeit nach Lichess: Mittel aus
     volatilitätsgewichtetem und harmonischem Mittel. */
  /* Leistung einer Partie: durchschnittlicher Zentibauern-Verlust (ACPL, wie bei lichess: Bewertungen auf ±1000
     begrenzt, Matt = ±1000) und daraus eine grobe Elo-Schätzung. Die Formel ist offen und bewusst einfach:
     Elo ≈ 3100 · e^(−ACPL/100), begrenzt auf 400–3000 (ACPL 20 ≈ 2540, 40 ≈ 2080, 60 ≈ 1700, 100 ≈ 1140).
     Eine einzelne Partie ist nur ein Anhaltspunkt. */
  function cpCapped(s) {
    if (!s) return null;
    if (s.mate != null) return s.mate > 0 ? 1000 : -1000;
    return Math.max(-1000, Math.min(1000, s.cp));
  }
  function eloFromAcpl(acpl) {
    return Math.round(Math.max(400, Math.min(3000, 3100 * Math.exp(-acpl / 100))) / 10) * 10;
  }
  var MIN_PERF_MOVES = 8;

  function summarize(moves) {
    var out = {};
    ['w', 'b'].forEach(function (c) {
      var counts = {}; ORDER.forEach(function (k) { counts[k] = 0; });
      out[c] = { counts: counts, accuracy: null, n: 0, acpl: null, elo: null };
    });
    // Gewinnchancen-Reihe (Weiß-Sicht) für die Gewichte
    var wps = [], i;
    for (i = 0; i < moves.length; i++) {
      var cl = moves[i].cls;
      if (!cl || cl.wpBefore == null) { wps.push(null); continue; }
      wps.push(moves[i].color === 'w' ? cl.wpBefore : 100 - cl.wpBefore);
    }
    var win = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
    var acc = { w: [], b: [] }, cpl = { w: [], b: [] };
    for (i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m.cls || !m.cls.key) continue;
      out[m.color].counts[m.cls.key]++;
      out[m.color].n++;
      var cb = cpCapped(m.cls.bestScore), cp = cpCapped(m.cls.playedScore);
      if (cb != null && cp != null && m.cls.key !== 'book' && m.cls.key !== 'forced') cpl[m.color].push(Math.max(0, cb - cp));
      if (m.cls.accuracy == null) continue;
      var lo = Math.max(0, i - win + 1), hi = Math.min(moves.length, lo + win);
      var seg = wps.slice(lo, hi).filter(function (x) { return x != null; });
      var w = Math.max(0.5, Math.min(12, stdev(seg)));
      acc[m.color].push({ a: m.cls.accuracy, w: w });
    }
    ['w', 'b'].forEach(function (c) {
      var l = cpl[c];
      if (l.length >= MIN_PERF_MOVES) {
        out[c].acpl = l.reduce(function (p, q) { return p + q; }, 0) / l.length;
        out[c].elo = eloFromAcpl(out[c].acpl);
      }
      var arr = acc[c];
      if (!arr.length) return;
      var sw = 0, swa = 0, sh = 0;
      arr.forEach(function (x) { sw += x.w; swa += x.w * x.a; sh += 1 / Math.max(x.a, 1); });
      var wmean = swa / sw, hmean = arr.length / sh;
      out[c].accuracy = (wmean + hmean) / 2;
    });
    return out;
  }

  root.SK.classify = {
    CATS: CATS, ORDER: ORDER, THRESHOLDS: T, VAL: VAL,
    cpToWp: cpToWp, scoreWp: scoreWp, negate: negate, fmtScore: fmtScore, scorePawns: scorePawns,
    moveAccuracy: moveAccuracy, see: see, hanging: hanging, material: material,
    detectSacrifice: detectSacrifice, classifyMove: classifyMove, summarize: summarize, uciOf: uciOf, eloFromAcpl: eloFromAcpl
  };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.classify;
