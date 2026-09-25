/* SK.coach – erklärt Züge in Klartext (Motive wie hängende Figur, Gabel, Matt),
   teilt die Partie in Phasen, liest Uhrzeiten aus der PGN. Reine Logik, in Node testbar. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var lib = null, CL = null;
  if (typeof module !== 'undefined' && typeof require === 'function') {
    try { lib = require('./vendor/chess.js'); CL = require('./classify.js'); } catch (e) { lib = null; }
  }
  function L() { return lib || root.SK.ChessLib; }
  function C() { return CL || root.SK.classify; }
  function Chess(fen) { return new (L().Chess)(fen); }

  var NOM = { p: 'der Bauer', n: 'der Springer', b: 'der Läufer', r: 'der Turm', q: 'die Dame', k: 'der König' };
  var AKK = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
  var DE = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' };
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function deSan(san) { return san.replace(/[KQRBN]/g, function (x) { return DE[x]; }).replace(/O-O-O/, '0-0-0').replace(/O-O/, '0-0'); }
  function uciMove(u) { return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }; }
  function play(fen, uci) {
    var c = Chess(fen), m = null;
    try { m = c.move(uciMove(uci)); } catch (e) { m = null; }
    return m ? { chess: c, move: m } : null;
  }

  /* ---------- Motive ---------- */

  // Greift die Figur auf `sq` (Farbe `color`) mindestens zwei lohnende Ziele an?
  // Ziel = König (Schach) oder Figur ≥ 3, die wertvoller oder ungedeckt ist.
  function forkTargets(chess, sq, color) {
    var p = chess.get(sq);
    if (!p || p.color !== color) return [];
    var V = C().VAL, opp = color === 'w' ? 'b' : 'w';
    var out = [], b = chess.board();
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var t = b[r][f];
      if (!t || t.color !== opp) continue;
      var ts = 'abcdefgh'[f] + (8 - r);
      if (chess.attackers(ts, color).indexOf(sq) < 0) continue;
      if (t.type === 'k') { out.push({ square: ts, type: 'k' }); continue; }
      if (V[t.type] < 3) continue;
      var defended = chess.attackers(ts, opp).length > 0;
      if (V[t.type] > V[p.type] || !defended) out.push({ square: ts, type: t.type });
    }
    return out.length >= 2 ? out : [];
  }

  function targetList(ts) {
    var names = ts.map(function (t) { return t.type === 'k' ? 'König' : NOM[t.type].split(' ')[1]; });
    return names.length === 2 ? names[0] + ' und ' + names[1] : names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1];
  }

  // Was macht ein Zug? → { mate, wins:{type, square}, fork:[…], check }
  function motifOf(fen, uci) {
    var pl = play(fen, uci);
    if (!pl) return null;
    var c = pl.chess, m = pl.move, V = C().VAL;
    var out = { san: m.san, piece: m.piece, mate: c.isCheckmate(), check: c.inCheck(), wins: null, fork: [] };
    if (m.captured) {
      var net = V[m.captured] - C().see(c, m.to);
      if (net >= 2) out.wins = { type: m.captured, square: m.to, net: net };
    }
    out.fork = forkTargets(c, m.to, m.color);
    return out;
  }

  /* explain(ctx) → Liste deutscher Sätze. ctx = { fenBefore, move:{from,to,promotion,san,color}, cls, after (Analyse
     der Folgestellung), notation:'de'|'en', clock:{left, spent} } */
  function explain(ctx) {
    var cls = ctx.cls, mv = ctx.move, out = [];
    if (!cls || !cls.key) return out;
    var N = ctx.notation === 'en' ? function (s) { return s; } : deSan;
    var uci = mv.from + mv.to + (mv.promotion || '');
    var fenAfter = ctx.fenAfter;
    if (!fenAfter) { var pa = play(ctx.fenBefore, uci); fenAfter = pa ? pa.chess.fen() : null; }
    var bad = /inaccuracy|mistake|blunder|miss/.test(cls.key);
    var own = motifOf(ctx.fenBefore, uci);

    if (!bad) {
      if (own && own.mate) out.push('Schachmatt.');
      else if (own && own.fork.length) out.push('Gabel: ' + cap(NOM[own.piece]) + ' greift ' + targetList(own.fork) + ' an.');
      else if (own && own.wins && cls.key !== 'brilliant') out.push('Gewinnt ' + AKK[own.wins.type] + ' auf ' + own.wins.square + '.');
      if (cls.playedScore && cls.playedScore.mate > 0 && !(own && own.mate)) out.push('Erzwingt Matt in ' + cls.playedScore.mate + '.');
      return out;
    }

    // 1) Was passiert jetzt? (Widerlegung durch den Gegner)
    var ref = ctx.after && ctx.after.lines && ctx.after.lines[0];
    if (ref && ref.score && ref.score.mate > 0) {
      out.push('Danach setzt der Gegner in ' + ref.score.mate + (ref.score.mate === 1 ? ' Zug' : ' Zügen') + ' matt' +
               (ref.uci && fenAfter ? ' (' + N(sanOf(fenAfter, ref.uci)) + ')' : '') + '.');
    } else if (ref && ref.uci && fenAfter) {
      var rm = motifOf(fenAfter, ref.uci);
      if (rm && rm.wins && rm.wins.square) {
        var movedHangs = rm.wins.square === mv.to;
        out.push((movedHangs ? cap(NOM[rm.wins.type]) + ' auf ' + rm.wins.square + ' steht ungedeckt' :
                  cap(NOM[rm.wins.type]) + ' auf ' + rm.wins.square + ' hängt') + ' – ' + N(rm.san) + ' gewinnt Material.');
      } else if (rm && rm.fork.length) {
        out.push('Der Gegner hat die Gabel ' + N(rm.san) + ' auf ' + targetList(rm.fork) + '.');
      }
    }
    // 2) Was wäre möglich gewesen? (bester Zug)
    if (cls.bestUci) {
      var bm = motifOf(ctx.fenBefore, cls.bestUci);
      var bs = N(bm ? bm.san : cls.bestUci);
      if (cls.bestScore && cls.bestScore.mate > 0) out.push(bs + ' hätte ' + (cls.bestScore.mate === 1 ? 'sofort' : 'in ' + cls.bestScore.mate + ' Zügen') + ' mattgesetzt.');
      else if (bm && bm.fork.length) out.push(bs + ' wäre eine Gabel auf ' + targetList(bm.fork) + ' gewesen.');
      else if (bm && bm.wins) out.push(bs + ' hätte ' + AKK[bm.wins.type] + ' auf ' + bm.wins.square + ' gewonnen.');
    }
    // 3) Uhr
    if (ctx.clock && ctx.clock.spent != null && ctx.clock.spent <= 3 && (cls.key === 'blunder' || cls.key === 'mistake')) {
      out.push('Gespielt nach nur ' + Math.max(0, Math.round(ctx.clock.spent)) + ' s Bedenkzeit – hier hätte sich Nachdenken gelohnt.');
    } else if (ctx.clock && ctx.clock.left != null && ctx.clock.left < 30 && bad) {
      out.push('In Zeitnot gespielt (' + fmtClock(ctx.clock.left) + ' auf der Uhr).');
    }
    return out;
  }

  function sanOf(fen, uci) { var p = play(fen, uci); return p ? p.move.san : uci; }

  /* ---------- Partiephasen ---------- */

  function majorsMinors(fen) {
    var n = 0, board = fen.split(' ')[0];
    for (var i = 0; i < board.length; i++) if ('nbrqNBRQ'.indexOf(board[i]) >= 0) n++;
    return n;
  }
  // 'opening' | 'middlegame' | 'endgame' für die Stellung VOR einem Zug
  function phaseOf(fen, inBook) {
    var mm = majorsMinors(fen);
    if (mm <= 6) return 'endgame';
    var fullmove = +fen.split(' ')[5] || 1;
    if (inBook || (fullmove <= 10 && mm >= 12)) return 'opening';
    return 'middlegame';
  }
  var PHASES = { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' };

  /* ---------- Uhr ---------- */

  function parseClk(comment) {
    var m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(comment || '');
    if (!m) return null;
    return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
  }
  // "600+2" → {base:600, inc:2}; "1/259200" (Fernschach) → null
  function parseTimeControl(tc) {
    var m = /^(\d+)(?:\+(\d+))?$/.exec(String(tc || '').trim());
    return m ? { base: +m[1], inc: +(m[2] || 0) } : null;
  }
  function fmtClock(s) {
    if (s == null) return '';
    s = Math.max(0, s);
    var h = Math.floor(s / 3600), mnt = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60);
    var frac = s < 10 ? '.' + Math.floor((s * 10) % 10) : '';
    return (h ? h + ':' + String(mnt).padStart(2, '0') : mnt) + ':' + String(sec).padStart(2, '0') + frac;
  }
  /* clocks: Restzeit nach jedem Zug (Sekunden oder null), colors: 'w'/'b' je Zug
     → spent: verbrauchte Zeit je Zug (null, wenn unbekannt) */
  function timeSpent(clocks, colors, tc) {
    var last = { w: tc ? tc.base : null, b: tc ? tc.base : null }, inc = tc ? tc.inc : 0;
    return clocks.map(function (c, i) {
      var col = colors[i], prev = last[col];
      last[col] = c;
      if (c == null || prev == null) return null;
      return Math.round(Math.max(0, prev - c + inc) * 10) / 10;
    });
  }

  root.SK.coach = {
    explain: explain, motifOf: motifOf, forkTargets: forkTargets, phaseOf: phaseOf, PHASES: PHASES,
    parseClk: parseClk, parseTimeControl: parseTimeControl, timeSpent: timeSpent, fmtClock: fmtClock, deSan: deSan
  };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.coach;
