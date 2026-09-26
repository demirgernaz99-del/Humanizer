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

  /* Texte für Coach-Sätze (Deutsch/Englisch). {p} = Figur, {P} = Figur groß, {a} = Figur (Akkusativ),
     {t} = Zielliste, {s} = Zug, {q} = Feld, {n} = Anzahl */
  var TXT = {
    de: {
      mate: 'Schachmatt.',
      fork: 'Gabel: {P} greift {t} an.',
      wins: 'Gewinnt {a} auf {q}.',
      forces_mate: 'Erzwingt Matt in {n}.',
      mate_allowed1: 'Danach setzt der Gegner sofort matt ({s}).',
      mate_allowed: 'Danach setzt der Gegner in {n} Zügen matt ({s}).',
      hangs_moved: '{P} auf {q} steht ungedeckt – {s} gewinnt Material.',
      hangs: '{P} auf {q} hängt – {s} gewinnt Material.',
      fork_allowed: 'Der Gegner hat die Gabel {s} auf {t}.',
      mate_missed1: '{s} hätte sofort mattgesetzt.',
      mate_missed: '{s} hätte in {n} Zügen mattgesetzt.',
      fork_missed: '{s} wäre eine Gabel auf {t} gewesen.',
      win_missed: '{s} hätte {a} auf {q} gewonnen.',
      fast: 'Gespielt nach nur {n} s Bedenkzeit – hier hätte sich Nachdenken gelohnt.',
      time_trouble: 'In Zeitnot gespielt ({s} auf der Uhr).',
      and: ' und '
    },
    en: {
      mate: 'Checkmate.',
      fork: 'Fork: the {p} attacks {t}.',
      wins: 'Wins the {p} on {q}.',
      forces_mate: 'Forces mate in {n}.',
      mate_allowed1: 'Now your opponent mates at once ({s}).',
      mate_allowed: 'Now your opponent mates in {n} ({s}).',
      hangs_moved: 'The {p} on {q} is unprotected – {s} wins material.',
      hangs: 'The {p} on {q} is hanging – {s} wins material.',
      fork_allowed: 'Your opponent has the fork {s} on {t}.',
      mate_missed1: '{s} would have been mate.',
      mate_missed: '{s} would have forced mate in {n}.',
      fork_missed: '{s} would have forked {t}.',
      win_missed: '{s} would have won the {p} on {q}.',
      fast: 'Played after only {n} s – this was a moment to think.',
      time_trouble: 'Played in time trouble ({s} on the clock).',
      and: ' and '
    }
  };
  var PIECE_NAMES = {
    de: { nom: NOM, akk: AKK, short: { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' } },
    en: { short: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } }
  };
  function lang(ctx) {
    var l = (ctx && ctx.lang) || (root.SK.i18n && root.SK.i18n.lang && root.SK.i18n.lang()) || 'de';
    return TXT[l] ? l : 'de';
  }
  function targetsText(ts, l) {
    var names = ts.map(function (t) { return PIECE_NAMES[l].short[t.type]; });
    if (l === 'en') names = names.map(function (n) { return 'the ' + n; });
    return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + TXT[l].and + names[names.length - 1];
  }
  function render(f, l) {
    var tpl = TXT[l][f.id + (f.n === 1 && TXT[l][f.id + '1'] ? '1' : '')] || '';
    return tpl.replace(/\{(\w)\}/g, function (_, k) {
      if (k === 'P') return l === 'de' ? cap(NOM[f.piece]) : 'The ' + PIECE_NAMES.en.short[f.piece];
      if (k === 'p') return l === 'de' ? NOM[f.piece] : PIECE_NAMES.en.short[f.piece];
      if (k === 'a') return l === 'de' ? AKK[f.piece] : 'the ' + PIECE_NAMES.en.short[f.piece];
      if (k === 't') return targetsText(f.targets || [], l);
      if (k === 's') return f.san != null ? f.san : '';
      if (k === 'q') return f.sq || '';
      if (k === 'n') return String(f.n);
      return '';
    });
  }

  /* facts(ctx) → Liste von Befunden { id, … } – Grundlage für Erklärungen (Text) und Tags (Insights).
     ctx = { fenBefore, fenAfter?, move:{from,to,promotion,color}, cls, after (Analyse der Folgestellung),
             notation:'de'|'en', clock:{left, spent}, base (Grundbedenkzeit in s) } */
  function facts(ctx) {
    var cls = ctx.cls, mv = ctx.move, out = [];
    if (!cls || !cls.key) return out;
    var N = ctx.notation === 'en' ? function (s) { return s; } : deSan;
    var uci = mv.from + mv.to + (mv.promotion || '');
    var fenAfter = ctx.fenAfter;
    if (!fenAfter) { var pa = play(ctx.fenBefore, uci); fenAfter = pa ? pa.chess.fen() : null; }
    var bad = /inaccuracy|mistake|blunder|miss/.test(cls.key);
    var own = motifOf(ctx.fenBefore, uci);

    if (!bad) {
      if (own && own.mate) out.push({ id: 'mate' });
      else if (own && own.fork.length) out.push({ id: 'fork', piece: own.piece, targets: own.fork });
      else if (own && own.wins && cls.key !== 'brilliant') out.push({ id: 'wins', piece: own.wins.type, sq: own.wins.square });
      if (cls.playedScore && cls.playedScore.mate > 0 && !(own && own.mate)) out.push({ id: 'forces_mate', n: cls.playedScore.mate });
      return out;
    }
    // 1) Was passiert jetzt? (Widerlegung durch den Gegner)
    var ref = ctx.after && ctx.after.lines && ctx.after.lines[0];
    if (ref && ref.score && ref.score.mate > 0) {
      out.push({ id: 'mate_allowed', n: ref.score.mate, san: ref.uci && fenAfter ? N(sanOf(fenAfter, ref.uci)) : '' });
    } else if (ref && ref.uci && fenAfter) {
      var rm = motifOf(fenAfter, ref.uci);
      if (rm && rm.wins && rm.wins.square) {
        out.push({ id: rm.wins.square === mv.to ? 'hangs_moved' : 'hangs', piece: rm.wins.type, sq: rm.wins.square, san: N(rm.san) });
      } else if (rm && rm.fork.length) {
        out.push({ id: 'fork_allowed', san: N(rm.san), targets: rm.fork });
      }
    }
    // 2) Was wäre möglich gewesen? (bester Zug)
    if (cls.bestUci) {
      var bm = motifOf(ctx.fenBefore, cls.bestUci);
      var bs = N(bm ? bm.san : cls.bestUci);
      if (cls.bestScore && cls.bestScore.mate > 0) out.push({ id: 'mate_missed', san: bs, n: cls.bestScore.mate });
      else if (bm && bm.fork.length) out.push({ id: 'fork_missed', san: bs, targets: bm.fork });
      else if (bm && bm.wins) out.push({ id: 'win_missed', san: bs, piece: bm.wins.type, sq: bm.wins.square });
    }
    // 3) Uhr
    var c = ctx.clock || {};
    var low = c.left != null && (c.left < 30 || (ctx.base && c.left < ctx.base * 0.1));
    if (c.spent != null && c.spent <= 3 && !low && (cls.key === 'blunder' || cls.key === 'mistake')) {
      out.push({ id: 'fast', n: Math.max(0, Math.round(c.spent)) });
    } else if (low) {
      out.push({ id: 'time_trouble', san: fmtClock(c.left) });
    }
    return out;
  }

  // Klartext-Sätze für die Oberfläche
  function explain(ctx) {
    var l = lang(ctx);
    return facts(ctx).map(function (f) { return render(f, l); });
  }

  // Kurze Merkmale für Statistiken über viele Partien
  var TAG = { mate_allowed: 'mate_allowed', hangs_moved: 'hanging', hangs: 'hanging', fork_allowed: 'fork_allowed',
              mate_missed: 'mate_missed', fork_missed: 'fork_missed', win_missed: 'win_missed', fast: 'fast',
              time_trouble: 'time_trouble', fork: 'fork', mate: 'mate', wins: 'wins', forces_mate: 'mate' };
  function tagsFor(ctx) {
    var out = [];
    facts(ctx).forEach(function (f) { var t = TAG[f.id]; if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }

  function sanOf(fen, uci) { var p = play(fen, uci); return p ? p.move.san : uci; }

  /* ---------- Denkfehler: WARUM ist der Fehler passiert? ----------
     Eine Hauptursache pro Fehler (plus Umstand: zu schnell / Zeitnot), damit man gezielt üben kann.
     Die Drohung vor dem Zug kommt aus einer Nullzug-Analyse: dieselbe Stellung, aber der Gegner ist am Zug.
     ctx wie bei facts(), zusätzlich: before (Analyse vor dem Zug), threat (Analyse der Nullzug-Stellung), phase. */
  var CAUSES = ['mate_blind', 'threat_missed', 'greedy', 'hung_piece', 'tactic_allowed', 'tactic_missed', 'technique', 'positional'];

  /* Materialbilanz entlang der Widerlegung: Wie viel Material hat der Ziehende nach bis zu 4 Halbzügen
     (Gegner, eigener Zug, Gegner, eigener Zug) im Vergleich zu vor seinem Zug? Negativ = verloren. */
  function pvMaterialDelta(fenBefore, fenAfter, pv, color) {
    if (!fenAfter || !pv || !pv.length) return 0;
    var m0 = C().material(Chess(fenBefore), color);
    var c = Chess(fenAfter), n = pv.length >= 4 ? 4 : pv.length >= 2 ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var m = null;
      try { m = c.move(uciMove(pv[i])); } catch (e) { m = null; }
      if (!m) break;
    }
    return C().material(c, color) - m0;
  }

  function nullFen(fen) {
    var p = fen.split(' ');
    p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-';
    return p.join(' ');
  }
  // Ernste Drohung des Gegners vor dem Zug (Matt oder ≥ 1,5 Bauern Gewinn gegenüber jetzt), sonst null
  function threatOf(ctx) {
    var th = ctx.threat && ctx.threat.lines && ctx.threat.lines[0];
    if (!th || !th.uci || !th.score) return null;
    var bl = ctx.before && ctx.before.lines && ctx.before.lines[0];
    var S = bl ? C().scorePawns(bl.score) : 0;   // Stellung aus Sicht des Ziehenden
    var T = C().scorePawns(th.score);             // Nullzug-Stellung aus Sicht des Gegners
    var mate = th.score.mate != null && th.score.mate > 0 ? th.score.mate : null;
    var gain = T + S;
    if (!mate && gain < 1.5) return null;
    var tm = motifOf(nullFen(ctx.fenBefore), th.uci);
    return { uci: th.uci, san: tm ? tm.san : th.uci, mate: mate, gain: gain, motif: tm };
  }
  // Setzt die Widerlegung dieselbe Idee um wie die Drohung (gleicher Zug, gleiches Matt, gleiche Beute)?
  function sameIdea(threat, ref, fenAfter) {
    if (!threat || !ref || !ref.uci) return false;
    if (ref.uci === threat.uci) return true;
    if (threat.mate && ref.score && ref.score.mate > 0) return true;
    var rm = fenAfter ? motifOf(fenAfter, ref.uci) : null, tm = threat.motif;
    return !!(rm && tm && tm.wins && rm.wins && tm.wins.square === rm.wins.square);
  }

  function diagnose(ctx) {
    var cls = ctx.cls;
    if (!cls || !/mistake|blunder|miss/.test(cls.key)) return null;
    var fs = facts(ctx), ids = fs.map(function (f) { return f.id; });
    function has(id) { return ids.indexOf(id) >= 0; }
    var mv = ctx.move, uci = mv.from + mv.to + (mv.promotion || '');
    var fenAfter = ctx.fenAfter;
    if (!fenAfter) { var pa = play(ctx.fenBefore, uci); fenAfter = pa ? pa.chess.fen() : null; }
    var ref = ctx.after && ctx.after.lines && ctx.after.lines[0];
    var threat = threatOf(ctx);
    var captured = !!(mv.captured || (play(ctx.fenBefore, uci) || { move: {} }).move.captured);
    var ignored = threat && sameIdea(threat, ref, fenAfter);
    var color = ctx.fenBefore.split(' ')[1];
    var matLoss = ref && ref.pv ? -pvMaterialDelta(ctx.fenBefore, fenAfter, ref.pv, color) : 0;
    var hangs = has('hangs') || has('hangs_moved');
    var cause;
    if (ignored) cause = 'threat_missed';
    else if (has('mate_allowed')) cause = 'mate_blind';
    else if (cls.key === 'miss') cause = 'tactic_missed';   // eine Gewinnchance ausgelassen wiegt schwerer als die Folgen
    else if (captured && (hangs || has('fork_allowed') || matLoss >= 1.5)) cause = 'greedy';
    else if (hangs) cause = 'hung_piece';
    else if (has('fork_allowed') || matLoss >= 2) cause = 'tactic_allowed';
    else if (cls.key === 'miss' || has('mate_missed') || has('fork_missed') || has('win_missed')) cause = 'tactic_missed';
    // Geschlagen (kein Zurückschlagen) und es war ein Fehler: die Beute hatte einen Haken
    else if (captured && !(ctx.prevMove && ctx.prevMove.captured && ctx.prevMove.to === mv.to)) cause = 'greedy';
    else if (ctx.phase === 'endgame') cause = 'technique';
    else cause = 'positional';
    var circ = has('time_trouble') ? 'time_trouble' : has('fast') ? 'fast' : null;
    var fast = fs.filter(function (f) { return f.id === 'fast'; })[0];
    return { cause: cause, circumstance: circ, spent: fast ? fast.n : null,
             threat: ignored ? { uci: threat.uci, san: threat.san, mate: threat.mate, motif: threat.motif } : null,
             sq: mv.to };
  }

  var CAUSE_TXT = {
    de: {
      mate_blind: ['Matt zugelassen', 'Prüfe vor jedem Zug alle Schachgebote des Gegners – auch die unwahrscheinlichen.'],
      threat_missed: ['Drohung übersehen', 'Frag vor jedem Zug: Was will der Gegner mit seinem letzten Zug? Üben kannst du das mit „Was droht?“ (Taste T).'],
      greedy: ['Vergiftete Beute', 'Vor dem Schlagen einen Zug weiter denken: Was schlägt oder droht der Gegner danach?'],
      hung_piece: ['Figur eingestellt', 'Blunder-Check vor dem Loslassen: Ist jede Figur nach meinem Zug noch gedeckt?'],
      tactic_allowed: ['Taktik des Gegners übersehen', 'Prüfe nach deinem Zug: Hat der Gegner einen Doppelangriff, eine Fesselung oder einen Abzug?'],
      tactic_missed: ['Chance übersehen', 'Suche zuerst für dich selbst: Schach, Schlagen, Drohungen – bevor du einen ruhigen Zug machst.'],
      technique: ['Endspieltechnik', 'Im Endspiel zählen der aktive König, Freibauern und das Verhindern von Gegenspiel.'],
      positional: ['Stellungsfehler', 'Kein taktischer Grund: Der Zug verschlechtert die Stellung auf Dauer. Vergleiche ihn mit der besseren Idee.'],
      threat_mate: '{opp} drohte {s} mit Matt – dein Zug hat nichts dagegen getan.',
      threat_wins: '{opp} drohte {s} und damit {a} zu gewinnen – dein Zug hat nichts dagegen getan.',
      threat_fork: '{opp} drohte die Gabel {s} – dein Zug hat nichts dagegen getan.',
      threat_any: '{opp} drohte {s} – dein Zug hat nichts dagegen getan.',
      greedy_txt: 'Das Schlagen auf {q} kostet mehr, als es bringt.',
      fast: 'Dabei nur {n} s nachgedacht.', time_trouble: 'In Zeitnot gespielt.',
      white: 'Weiß', black: 'Schwarz'
    },
    en: {
      mate_blind: ['Allowed mate', 'Before every move, check all of your opponent\'s checks – even the unlikely ones.'],
      threat_missed: ['Missed the threat', 'Before every move, ask: what does my opponent want with their last move? Practise with “What\'s the threat?” (T key).'],
      greedy: ['Poisoned bait', 'Before capturing, think one move further: what does your opponent take or threaten next?'],
      hung_piece: ['Hung a piece', 'Blunder check before you let go: is every piece still protected after my move?'],
      tactic_allowed: ['Allowed a tactic', 'After your move, check: does your opponent have a double attack, a pin or a discovered attack?'],
      tactic_missed: ['Missed a chance', 'Look for your own checks, captures and threats first – before making a quiet move.'],
      technique: ['Endgame technique', 'In the endgame, an active king, passed pawns and stopping counterplay are what count.'],
      positional: ['Positional error', 'No tactical reason: the move worsens your position in the long run. Compare it with the better idea.'],
      threat_mate: '{opp} threatened {s} with mate – your move did nothing about it.',
      threat_wins: '{opp} threatened {s}, winning {a} – your move did nothing about it.',
      threat_fork: '{opp} threatened the fork {s} – your move did nothing about it.',
      threat_any: '{opp} threatened {s} – your move did nothing about it.',
      greedy_txt: 'Capturing on {q} costs more than it gains.',
      fast: 'Played after only {n} s.', time_trouble: 'Played in time trouble.',
      white: 'White', black: 'Black'
    }
  };
  // Diagnose → { title, text, tip } in der gewünschten Sprache; notation 'de' übersetzt Figurenbuchstaben
  function describeCause(d, opts) {
    if (!d) return null;
    var l = lang(opts), T = CAUSE_TXT[l], N = opts && opts.notation === 'en' ? function (x) { return x; } : deSan;
    var parts = [];
    if (d.threat) {
      var oppCol = opts && opts.moverColor === 'w' ? T.black : T.white;
      var m = d.threat.motif, key = d.threat.mate ? 'threat_mate' : m && m.fork && m.fork.length ? 'threat_fork' : m && m.wins ? 'threat_wins' : 'threat_any';
      parts.push(T[key].replace('{opp}', oppCol).replace('{s}', N(d.threat.san))
        .replace('{a}', m && m.wins ? (l === 'de' ? AKK[m.wins.type] : 'the ' + PIECE_NAMES.en.short[m.wins.type]) : ''));
    } else if (d.cause === 'greedy') {
      parts.push(T.greedy_txt.replace('{q}', d.sq));
    }
    if (d.circumstance === 'fast' && d.spent != null) parts.push(T.fast.replace('{n}', d.spent));
    else if (d.circumstance === 'time_trouble') parts.push(T.time_trouble);
    return { id: d.cause, title: T[d.cause][0], text: parts.join(' '), tip: T[d.cause][1] };
  }
  // Übungsthemen zu den Denkfehlern: [Titel, Aufgabenstellung]
  var TRAIN_TXT = {
    de: {
      threat_missed: ['Drohungen erkennen', 'Dein Gegner droht etwas. Finde den Zug, der die Drohung abwehrt – oder etwas noch Besseres.'],
      mate_blind: ['Mattgefahr sehen', 'Achtung, Mattgefahr! Finde den Zug, der sicher ist.'],
      greedy: ['Vergiftete Beute erkennen', 'Nicht jedes Geschenk ist eins. Finde den besten Zug.'],
      hung_piece: ['Figuren sichern', 'Finde einen Zug, nach dem keine Figur ungedeckt herumsteht.'],
      tactic_allowed: ['Gegnerische Taktik sehen', 'Welche Taktik hätte dein Gegner? Finde den Zug, der sie verhindert.'],
      tactic_missed: ['Eigene Chancen finden', 'Hier gibt es etwas zu holen. Such nach Schach, Schlagen und Drohungen.'],
      technique: ['Endspieltechnik', 'Finde den Zug, der das Endspiel richtig führt.'],
      positional: ['Bessere Pläne finden', 'Kein Taktik-Trick nötig: Finde den Zug, der deine Stellung wirklich verbessert.']
    },
    en: {
      threat_missed: ['Spotting threats', 'Your opponent is threatening something. Find the move that stops it – or something even better.'],
      mate_blind: ['Seeing mating danger', 'Careful, mate is in the air! Find the safe move.'],
      greedy: ['Spotting poisoned bait', 'Not every gift is a gift. Find the best move.'],
      hung_piece: ['Keeping pieces safe', 'Find a move after which no piece is left unprotected.'],
      tactic_allowed: ['Seeing the opponent\'s tactics', 'What tactic would your opponent have? Find the move that prevents it.'],
      tactic_missed: ['Finding your chances', 'There is something to win here. Look for checks, captures and threats.'],
      technique: ['Endgame technique', 'Find the move that handles the endgame correctly.'],
      positional: ['Finding better plans', 'No trick needed: find the move that really improves your position.']
    }
  };
  function trainTitle(id, l) { var T = TRAIN_TXT[l === 'en' ? 'en' : 'de']; return T[id] ? T[id][0] : id; }
  function trainTask(id, l) { var T = TRAIN_TXT[l === 'en' ? 'en' : 'de']; return T[id] ? T[id][1] : ''; }
  function causeTitle(id, l) { var T = CAUSE_TXT[l === 'en' ? 'en' : 'de']; return T[id] ? T[id][0] : id; }
  function causeTip(id, l) { var T = CAUSE_TXT[l === 'en' ? 'en' : 'de']; return T[id] ? T[id][1] : ''; }

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
    explain: explain, facts: facts, tagsFor: tagsFor, render: render, motifOf: motifOf, forkTargets: forkTargets, phaseOf: phaseOf, PHASES: PHASES,
    diagnose: diagnose, describeCause: describeCause, causeTitle: causeTitle, causeTip: causeTip, CAUSES: CAUSES, nullFen: nullFen, threatOf: threatOf,
    trainTitle: trainTitle, trainTask: trainTask,
    parseClk: parseClk, parseTimeControl: parseTimeControl, timeSpent: timeSpent, fmtClock: fmtClock, deSan: deSan
  };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.coach;
