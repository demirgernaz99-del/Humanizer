/* Zugradar – App: Zustand, Live-Analyse, Zugbewertung, Spiel gegen die KI, Review,
   Insights über viele Partien, Taktik-Trainer, Pro-Freischaltung, Teilen. */
(function () {
  'use strict';
  var SK = window.SK, L = SK.ChessLib, C = SK.classify, E = SK.engine, CO = SK.coach;
  var I = SK.i18n, t = I.t, LIC = SK.license, CFG = SK.config, LIB = SK.library, SRS = SK.srs, INS = SK.insights;
  var START = L.DEFAULT_POSITION;
  var STORE = 'zugradar.v1';
  var MIN_D = 12;        // Mindesttiefe, ab der ein Zug bewertet wird
  var MIN_D_AFTER = 10;  // Mindesttiefe der Folgestellung
  var ANNOUNCE_D = 14;   // ab dieser Tiefe gibt es das „Brillant!!“-Banner
  var BATCH_D = 12;      // Tiefe für die Serien-Analyse (Insights)

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(x, d) { return x == null ? '–' : I.num(x * 100, d || 0) + ' %'; }
  function num1(x) { return x == null ? '–' : I.num(x, 1); }

  var LEVELS = [
    { id: 'beginner', label: 'Anfänger (~800)', strength: { skill: 0 }, movetime: 150 },
    { id: 'casual', label: 'Gelegenheitsspieler (~1350)', strength: { elo: 1350 }, movetime: 500 },
    { id: 'club', label: 'Vereinsspieler (~1700)', strength: { elo: 1700 }, movetime: 600 },
    { id: 'strong', label: 'Stark (~2000)', strength: { elo: 2000 }, movetime: 700 },
    { id: 'expert', label: 'Experte (~2300)', strength: { elo: 2300 }, movetime: 800 },
    { id: 'master', label: 'Meister (~2600)', strength: { elo: 2600 }, movetime: 1000 },
    { id: 'gm', label: 'Großmeister (~2900)', strength: { elo: 2900 }, movetime: 1200 },
    { id: 'max', label: 'Maximal (volle Stärke)', strength: null, movetime: 2000 }
  ];
  var THEMES = [
    { id: 'club', label: 'Vereinsbrett' }, { id: 'walnut', label: 'Nussbaum' }, { id: 'slate', label: 'Schiefer' },
    { id: 'marble', label: 'Marmor' }, { id: 'night', label: 'Nacht' }
  ];
  var DEFAULTS = {
    liveMax: 22, reviewDepth: 16, lines: 3, notation: I.lang() === 'en' ? 'en' : 'de',
    arrowBest: true, arrowAlt: false, arrowBetter: true, badges: true, autoReview: true,
    hints: true, humanColor: 'w', level: 'club', theme: 'club', sound: true,
    connSite: 'chesscom', connUser: '', connAuto: false, connLast: 0, welcomed: false
  };
  var SAMPLE = {
    headers: { Event: 'Hoogovens', Site: 'Wijk aan Zee', Date: '1999.01.20', White: 'Garri Kasparow', Black: 'Wesselin Topalow', Result: '1-0' },
    moves: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4 cxd4 Re7+ Kb6 Qxd4+ Kxa5 b4+ Ka4 Qc3 Qxd5 Ra7 Bb7 Rxb7 Qc4 Qxf6 Kxa3 Qxa6+ Kxb4 c3+ Kxc3 Qa1+ Kd2 Qb2+ Kd1 Bf1 Rd2 Rd7 Rxd7 Bxc4 bxc4 Qxh8 Rd3 Qa8 c3 Qa4+ Ke1 f4 f5 Kc1 Rd2 Qa7',
    ply: 47 // Stellung nach 24.Txd4!!
  };

  var state = {
    startFen: START, line: [], main: null, ply: 0, mode: 'analyse', orientation: 'w',
    headers: {}, settings: Object.assign({}, DEFAULTS), sample: false,
    user: null,   // { name, color } – wer „du“ in der geladenen Partie bist
    game: null,   // { site, id, url } – Herkunft der geladenen Partie
    pgn: null     // Original-PGN der geladenen Partie (für die Bibliothek)
  };
  var train = null; // Fehler-Training (aktuelle Partie oder Trainer), siehe unten

  /* ---------- Stellungs-Hilfen ---------- */

  var posMemo = new Map();
  function posInfo(fen) {
    var p = posMemo.get(fen);
    if (p) return p;
    var c = new L.Chess(fen);
    var moves = c.moves({ verbose: true });
    var terminal = null;
    if (!moves.length) terminal = c.inCheck() ? 'mate' : 'draw';
    else if (c.isInsufficientMaterial()) terminal = 'draw';
    var king = null;
    if (c.inCheck()) {
      var b = c.board();
      for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
        var x = b[r][f];
        if (x && x.type === 'k' && x.color === c.turn()) king = 'abcdefgh'[f] + (8 - r);
      }
    }
    p = { moves: moves, legal: moves.length, inCheck: c.inCheck(), turn: c.turn(), terminal: terminal, king: king,
          fullmove: +fen.split(' ')[5] || 1 };
    if (posMemo.size > 6000) posMemo.clear();
    posMemo.set(fen, p);
    return p;
  }
  function fenAt(i) { return i === 0 ? state.startFen : state.line[i - 1].fenAfter; }
  // Stellung, die gerade auf dem Brett steht (im Training die Trainingsstellung)
  function viewFen() {
    if (train && train.items[train.i]) return train.attempt ? train.attempt.fenAfter : train.items[train.i].fen;
    return fenAt(state.ply);
  }

  var nextId = 1;
  function makeMove(fenBefore, input) {
    var c = new L.Chess(fenBefore);
    var pi = posInfo(fenBefore);
    var m;
    try { m = c.move(input); } catch (e) { return null; }
    if (!m) return null;
    return { id: nextId++, san: m.san, from: m.from, to: m.to, promotion: m.promotion, piece: m.piece,
             captured: m.captured, flags: m.flags, color: m.color, uci: m.from + m.to + (m.promotion || ''),
             fenBefore: fenBefore, fenAfter: c.fen(), legalCount: pi.legal, inCheck: pi.inCheck };
  }
  function uciToMove(uci) { return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }; }
  function terminalOf(fen) { return posInfo(fen).terminal; }

  // SAN in der gewählten Notation (Deutsch: K D T L S)
  var DE = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' };
  function nota(san) {
    if (state.settings.notation !== 'de') return san;
    return san.replace(/[KQRBN]/g, function (x) { return DE[x]; }).replace(/O-O-O/, '0-0-0').replace(/O-O/, '0-0');
  }
  var sanMemo = new Map();
  function uciSan(fen, uci) {
    var k = fen + '|' + uci, s = sanMemo.get(k);
    if (s) return s;
    var c = new L.Chess(fen), m = null;
    try { m = c.move(uciToMove(uci)); } catch (e) { m = null; }
    s = m ? m.san : uci;
    if (sanMemo.size > 5000) sanMemo.clear();
    sanMemo.set(k, s);
    return s;
  }
  // PV → „12. Sf3 Lg4 13. …“
  // Hauptvariante als Text; gemerkt, weil jedes Neuzeichnen sonst alle Linien neu durchrechnet
  var pvMemo = new Map();
  function pvText(fen, pv, max) {
    var mk = fen + '|' + pv.join(' ') + '|' + (max || 10) + '|' + state.settings.notation;
    var hit = pvMemo.get(mk);
    if (hit !== undefined) return hit;
    var res = pvTextRaw(fen, pv, max);
    if (pvMemo.size > 3000) pvMemo.clear();
    pvMemo.set(mk, res);
    return res;
  }
  function pvTextRaw(fen, pv, max) {
    var c = new L.Chess(fen), out = [], n = Math.min(pv.length, max || 10);
    for (var i = 0; i < n; i++) {
      var turn = c.turn(), num = c.moveNumber(), m;
      try { m = c.move(uciToMove(pv[i])); } catch (e) { break; }
      if (!m) break;
      var s = nota(m.san);
      if (turn === 'w') out.push(num + '. ' + (i === 0 ? '<b>' + esc(s) + '</b>' : esc(s)));
      else out.push((i === 0 ? num + '… ' : '') + (i === 0 ? '<b>' + esc(s) + '</b>' : esc(s)));
    }
    return out.join(' ');
  }

  // Bewertung aus Weiß-Sicht
  function whiteScore(fen, score) { return posInfo(fen).turn === 'w' ? score : C.negate(score); }
  function whiteWp(fen, entry) {
    var pi = posInfo(fen);
    if (pi.terminal === 'mate') return pi.turn === 'w' ? 0 : 100;
    if (pi.terminal === 'draw') return 50;
    if (!entry || !entry.lines.length) return null;
    var wp = C.scoreWp(entry.lines[0].score);
    return pi.turn === 'w' ? wp : 100 - wp;
  }
  function fmtW(fen, score) { return C.fmtScore(whiteScore(fen, score)); }
  function catLabel(key) { return t(C.CATS[key].label); }
  function colorName(c) { return c === 'w' ? t('Weiß') : t('Schwarz'); }

  /* ---------- Engine ---------- */

  var engine = new E.Engine();
  var an = new E.Analyzer(engine, {});
  function reviewDepth() { return Math.min(+state.settings.reviewDepth, LIC.limits().reviewDepthMax || 16); }
  function applyEngineCfg() {
    var s = state.settings;
    an.configure({ liveMax: +s.liveMax, liveMin: Math.min(16, +s.liveMax), reviewDepth: reviewDepth(),
                   liveMpv: +s.lines < 2 ? 2 : +s.lines, reviewMpv: 2 });
  }

  var renderQueued = false;
  function soon() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function () { renderQueued = false; render(); }, 90);
  }
  an.onUpdate = function () { batchCheck(); saveCurrentIfDone(); soon(); };
  an.onActivity = function () { soon(); };
  var engineDetail = '', engineT0 = Date.now(), warmEngineCache = null;
  engine.onStatus = function (st, detail) {
    engineDetail = detail || '';
    if (st === 'ready') { applyEngineCfg(); updateEngine(); if (warmEngineCache) warmEngineCache(); }
    soon();
  };

  function updateEngine() {
    var fen = viewFen(), pi = posInfo(fen);
    for (var i = 0; i <= state.line.length; i++) {
      var f = fenAt(i), p = posInfo(f);
      if (p.terminal) an.markTerminal(f, p.terminal);
    }
    an.setFocus(fen, pi.terminal ? 0 : pi.legal);
    var items = [];
    var n = state.line.length;
    if (state.settings.autoReview) {
      for (var j = 0; j <= n; j++) items.push(j);
    } else {
      if (state.ply > 0) items.push(state.ply - 1);
      items.push(state.ply);
    }
    // Stellungen rund um den gerade betrachteten Zug zuerst
    var ref = Math.max(0, state.ply - 1);
    items.sort(function (a, b) { return Math.abs(a - ref) - Math.abs(b - ref) || a - b; });
    var queue = items.map(function (k) { var f2 = fenAt(k); return { fen: f2, legal: posInfo(f2).legal }; })
      .filter(function (x) { return x.legal > 0 && !posInfo(x.fen).terminal; });
    // Danach die Serien-Analyse für Insights (niedrigere Tiefe)
    if (batch.cur) {
      batch.cur.fens.forEach(function (f3) {
        var p3 = posInfo(f3);
        if (p3.terminal) { an.markTerminal(f3, p3.terminal); return; }
        queue.push({ fen: f3, legal: p3.legal, depth: BATCH_D, batch: true });
      });
    }
    an.setQueue(queue);
    maybeAI();
  }

  /* ---------- Bewertung aller Züge ---------- */

  var clsMemo = new Map();
  function bookStart() { return E.posKey(state.startFen) === E.posKey(START); }
  function classifyAll() {
    var out = [], prev = null, chain = bookStart();
    for (var i = 0; i < state.line.length; i++) {
      var mv = state.line[i];
      if (!mv.phase) mv.phase = CO.phaseOf(mv.fenBefore, chain && i > 0);
      chain = chain && !!SK.book.lookup(mv.fenAfter);
      var r = classifyOne(mv, prev, i > 0 ? state.line[i - 1] : null, chain);
      out.push(r);
      prev = r;
    }
    return out;
  }
  function classifyOne(mv, prev, lastMove, inBook) {
    var eb = an.entry(mv.fenBefore), ea = an.entry(mv.fenAfter);
    var pa = posInfo(mv.fenAfter);
    var after = pa.terminal ? { terminal: pa.terminal, lines: [], depth: 99 } : ea;
    // Theorie braucht keine Engine – die Bewertung wird nachgereicht, sobald sie da ist
    if (inBook && mv.legalCount > 1 && (!eb || eb.depth < MIN_D || !eb.lines.length)) {
      return { key: 'book', loss: null, wpBefore: null, wpAfter: null, accuracy: null, depth: 0, reasons: [] };
    }
    if (mv.legalCount > 1) {
      if (!eb || eb.depth < MIN_D || !eb.lines.length) return null;
      var inLines = eb.lines.some(function (l) { return l.uci === mv.uci; });
      if (!inLines && !(after && (after.terminal || after.depth >= MIN_D_AFTER))) return null;
    }
    var prevLoss = prev && prev.loss != null ? Math.round(prev.loss) : null;
    var key = [mv.id, eb ? eb.depth : 0, eb ? eb.lines.length : 0, after ? after.depth : 0, prevLoss, inBook ? 1 : 0].join('|');
    var hit = clsMemo.get(key);
    if (hit !== undefined) return hit;
    var r = C.classifyMove({
      fenBefore: mv.fenBefore, move: mv, before: eb, after: after, legalCount: mv.legalCount,
      inCheck: mv.inCheck, prevLoss: prevLoss, lastMove: lastMove, inBook: inBook
    });
    if (r) r.depth = eb ? eb.depth : 0;
    if (clsMemo.size > 6000) clsMemo.clear();
    clsMemo.set(key, r);
    return r;
  }

  /* ---------- KI-Gegner ---------- */

  var ai = { fen: null, timer: null, thinking: false };
  function level() {
    var id = state.settings.level;
    return LEVELS.filter(function (l) { return l.id === id; })[0] || LEVELS[2];
  }
  function cancelAI() {
    if (ai.timer) clearTimeout(ai.timer);
    ai.timer = null; ai.fen = null;
    if (ai.thinking) { ai.thinking = false; an.cancelMove(); }
  }
  function maybeAI() {
    if (state.mode !== 'play' || train || state.ply !== state.line.length || engine.state !== 'ready') { cancelAI(); return; }
    var fen = fenAt(state.ply), pi = posInfo(fen);
    if (pi.terminal || pi.turn === state.settings.humanColor) { cancelAI(); return; }
    if (ai.fen === fen) return;
    cancelAI();
    ai.fen = fen;
    var t0 = Date.now();
    // Erst kurz die Stellung analysieren (für die Bewertung deines Zuges), dann zieht die KI.
    (function wait() {
      if (ai.fen !== fen) return;
      var e = an.entry(fen);
      if ((e && e.depth >= MIN_D) || Date.now() - t0 > 2500) {
        ai.timer = null; ai.thinking = true; soon();
        var lv = level();
        an.requestMove(fen, lv.strength, lv.movetime, function (bm) {
          ai.thinking = false;
          if (ai.fen !== fen || fenAt(state.ply) !== fen || state.ply !== state.line.length) return;
          ai.fen = null;
          var mv = bm && bm !== '(none)' ? makeMove(fen, uciToMove(bm)) : null;
          if (!mv) { soon(); return; }
          mv.live = true;
          state.line.push(mv); state.ply++;
          animateNext = { from: mv.from, to: mv.to, capture: !!mv.captured };
          changed();
        });
        return;
      }
      ai.timer = setTimeout(wait, 120);
    })();
  }

  /* ---------- Zustand ändern ---------- */

  var animateNext = null;
  function changed() {
    save();
    updateEngine();
    render();
  }

  function userMove(input) {
    var fen = fenAt(state.ply);
    var mv = makeMove(fen, input);
    if (!mv) return false;
    mv.live = true;
    if (state.mode === 'play') {
      state.line = state.line.slice(0, state.ply);
      state.main = null;
      state.line.push(mv); state.ply++;
    } else {
      var next = state.line[state.ply];
      if (next && next.uci === mv.uci) state.ply++;
      else {
        if (state.ply < state.line.length) {
          if (!state.main) state.main = { line: state.line, ply: state.ply };
          state.line = state.line.slice(0, state.ply);
        }
        state.line.push(mv); state.ply++;
      }
    }
    animateNext = { from: mv.from, to: mv.to, capture: !!mv.captured };
    changed();
    return true;
  }

  function go(ply, animate) {
    ply = Math.max(0, Math.min(state.line.length, ply));
    if (ply === state.ply) return;
    if (animate && ply === state.ply + 1) {
      var m = state.line[state.ply];
      animateNext = { from: m.from, to: m.to, capture: !!m.captured };
    }
    state.ply = ply;
    changed();
  }

  function newGame() {
    cancelAI();
    stopTraining(true);
    state.startFen = START; state.line = []; state.main = null; state.ply = 0;
    state.headers = {}; state.sample = false; state.user = null; state.game = null; state.pgn = null;
    if (state.mode === 'play') state.orientation = state.settings.humanColor;
    if (state.mode === 'insights' || state.mode === 'trainer') setMode('analyse', true);
    changed();
  }

  function loadLine(startFen, sans, headers, ply, opts) {
    opts = opts || {};
    cancelAI();
    stopTraining(true);
    var fen = startFen, line = [];
    for (var i = 0; i < sans.length; i++) {
      var mv = makeMove(fen, sans[i]);
      if (!mv) break;
      line.push(mv); fen = mv.fenAfter;
    }
    state.startFen = startFen; state.line = line; state.main = null;
    state.ply = ply == null ? 0 : Math.min(ply, line.length);
    state.headers = headers || {};
    state.user = opts.user || inferUser(state.headers);
    state.game = opts.game || null;
    state.pgn = opts.pgn || null;
    savedFor = null;
    if (opts.clocks) attachClocks(line, opts.clocks, state.headers.TimeControl);
    // Brett: deine Farbe unten, sonst Weiß unten (wie auf allen Plattformen üblich)
    state.orientation = state.user && state.user.color ? state.user.color : 'w';
    if (state.mode !== 'analyse') setMode('analyse', true);
    changed();
  }

  // Stimmt der Konnektor-Name mit Weiß oder Schwarz überein? Dann bist das du.
  function inferUser(h) {
    var u = (state.settings.connUser || '').toLowerCase();
    if (!u || !h) return null;
    if ((h.White || '').toLowerCase() === u) return { name: h.White, color: 'w' };
    if ((h.Black || '').toLowerCase() === u) return { name: h.Black, color: 'b' };
    return null;
  }

  // Restzeit nach jedem Zug (aus [%clk …]) und daraus die verbrauchte Bedenkzeit
  function attachClocks(line, clocks, tcHeader) {
    if (!clocks || !clocks.some(function (c) { return c != null; })) return;
    var spent = CO.timeSpent(clocks, line.map(function (m) { return m.color; }), CO.parseTimeControl(tcHeader));
    line.forEach(function (m, i) { m.clock = clocks[i] != null ? clocks[i] : null; m.spent = spent[i]; });
  }

  // PGN → { start, sans, headers, clocks } oder { error }
  function parsePgn(txt) {
    var pgn = txt;
    // Deutsche Figurenbuchstaben in einfachen Zuglisten erlauben
    if (!/\[\w+\s+"/.test(pgn) && /\b[SLTD][a-h1-8x]/.test(pgn)) {
      pgn = pgn.replace(/\b([SLTDK])(?=[a-h1-8x])/g, function (x) { return { S: 'N', L: 'B', T: 'R', D: 'Q', K: 'K' }[x]; })
               .replace(/=([SLTD])/g, function (_, x) { return '=' + { S: 'N', L: 'B', T: 'R', D: 'Q' }[x]; })
               .replace(/0-0-0/g, 'O-O-O').replace(/0-0(?!-)/g, 'O-O');
    }
    var c = new L.Chess();
    try { c.loadPgn(pgn); } catch (e) { return { error: t('PGN konnte nicht gelesen werden: {e}', { e: e && e.message ? e.message : e }) }; }
    var hist = c.history({ verbose: true });
    var headers = c.getHeaders ? c.getHeaders() : {};
    if (!hist.length && !headers.FEN) return { error: t('In der PGN wurden keine Züge gefunden.') };
    var comments = {};
    try { (c.getComments() || []).forEach(function (x) { comments[x.fen] = x.comment; }); } catch (e) { comments = {}; }
    return {
      start: hist.length ? hist[0].before : c.fen(),
      sans: hist.map(function (m) { return m.san; }),
      headers: headers,
      clocks: hist.map(function (m) { return CO.parseClk(comments[m.after]); })
    };
  }
  function lineFromParsed(p) {
    var fen = p.start, line = [];
    for (var i = 0; i < p.sans.length; i++) {
      var mv = makeMove(fen, p.sans[i]);
      if (!mv) break;
      line.push(mv); fen = mv.fenAfter;
    }
    attachClocks(line, p.clocks, p.headers.TimeControl);
    return line;
  }

  // PGN oder FEN laden → Fehlertext oder null
  function importText(txt, meta) {
    txt = (txt || '').trim();
    if (!txt) return t('Bitte eine PGN oder FEN einfügen.');
    var fenLike = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\b/.test(txt);
    if (fenLike) {
      var v = L.validateFen(txt);
      if (!v.ok) return t('Ungültige FEN: {e}', { e: v.error });
      state.sample = false;
      loadLine(new L.Chess(txt).fen(), [], {}, 0);
      return null;
    }
    var p = parsePgn(txt);
    if (p.error) return p.error;
    state.sample = false;
    meta = meta || {};
    loadLine(p.start, p.sans, p.headers, meta.ply != null ? meta.ply : p.sans.length,
             { clocks: p.clocks, user: meta.user, game: meta.game, pgn: txt });
    return null;
  }

  function loadSample() {
    state.sample = true;
    loadLine(START, SAMPLE.moves.split(' '), SAMPLE.headers, SAMPLE.ply);
  }

  // Geladene Partie, solange du gegen die KI spielst. Hast du noch nicht gezogen, kommt sie beim Wechsel zurück.
  var stash = null;
  function isLoadedGame() {
    return state.line.length > 0 && !!(state.sample || state.game || state.pgn || (state.headers && state.headers.White));
  }
  function stashGame() {
    var base = state.main || state;
    stash = { startFen: state.startFen, line: base.line, ply: base.ply, headers: state.headers, sample: state.sample,
              user: state.user, game: state.game, pgn: state.pgn, orientation: state.orientation };
    state.startFen = START; state.line = []; state.main = null; state.ply = 0;
    state.headers = {}; state.sample = false; state.user = null; state.game = null; state.pgn = null;
  }
  function unstashGame() {
    var s2 = stash; stash = null;
    state.startFen = s2.startFen; state.line = s2.line; state.ply = s2.ply; state.main = null;
    state.headers = s2.headers; state.sample = s2.sample; state.user = s2.user; state.game = s2.game; state.pgn = s2.pgn;
    state.orientation = s2.orientation; savedFor = null;
  }
  // Aus der beiseitegelegten Partie ab der gezeigten Stellung gegen die KI weiterspielen
  function playFromStash() {
    if (!stash) return;
    var s2 = stash; stash = null;
    cancelAI();
    state.startFen = s2.startFen; state.line = s2.line.slice(0, s2.ply); state.ply = state.line.length; state.main = null;
    state.headers = {}; state.sample = false; state.user = null; state.game = null; state.pgn = null;
    state.line.forEach(function (m) { m.live = false; });
    changed();
  }

  function setMode(mode, silent) {
    var prev = state.mode;
    state.mode = mode;
    if (mode !== 'trainer' && train && train.source === 'srs') stopTraining(true);
    if (mode === 'play') {
      if (prev !== 'play' && isLoadedGame()) stashGame();
      if (state.main) state.main = null;
      state.orientation = state.settings.humanColor;
    } else {
      cancelAI();
      if (prev === 'play' && stash) { if (!state.line.length) unstashGame(); else stash = null; }
    }
    if (mode === 'insights' && prev !== 'insights') insightsDirty = true;
    if (!silent) changed();
  }

  /* ---------- Speicher ---------- */

  function save() {
    try {
      var data = {
        v: 1, startFen: state.startFen, moves: state.line.map(function (m) { return m.uci; }),
        main: state.main ? { moves: state.main.line.map(function (m) { return m.uci; }), ply: state.main.ply } : null,
        ply: state.ply, mode: state.mode, orientation: state.orientation, headers: state.headers,
        settings: state.settings, sample: state.sample, user: state.user, game: state.game,
        pgn: state.pgn && state.pgn.length < 20000 ? state.pgn : null,
        clocks: state.line.some(function (m) { return m.clock != null; }) ? state.line.map(function (m) { return m.clock != null ? m.clock : null; }) : null
      };
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch (e) { /* privat / blockiert – egal */ }
  }
  function buildLine(startFen, ucis) {
    var fen = startFen, line = [];
    for (var i = 0; i < ucis.length; i++) {
      var mv = makeMove(fen, uciToMove(ucis[i]));
      if (!mv) break;
      line.push(mv); fen = mv.fenAfter;
    }
    return line;
  }
  function restore() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { d = null; }
    if (!d || d.v !== 1) return false;
    try {
      state.settings = Object.assign({}, DEFAULTS, d.settings || {});
      var v = L.validateFen(d.startFen || START);
      state.startFen = v.ok ? d.startFen : START;
      state.line = buildLine(state.startFen, d.moves || []);
      state.main = d.main ? { line: buildLine(state.startFen, d.main.moves || []), ply: d.main.ply || 0 } : null;
      state.ply = Math.max(0, Math.min(state.line.length, d.ply || 0));
      state.mode = /^(analyse|play|insights|trainer)$/.test(d.mode) ? d.mode : 'analyse';
      state.orientation = d.orientation === 'b' ? 'b' : 'w';
      state.headers = d.headers || {};
      state.sample = !!d.sample;
      state.user = d.user || null;
      state.game = d.game || null;
      state.pgn = d.pgn || null;
      if (d.clocks && !state.main) attachClocks(state.line, d.clocks, state.headers.TimeControl);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Darstellung ---------- */

  var board;
  var lastAnnounced = 0;

  function showEngineNow() {
    if (state.mode !== 'play') return true;
    var pi = posInfo(fenAt(state.ply));
    if (pi.terminal || state.ply < state.line.length) return true;
    return state.settings.hints && pi.turn === state.settings.humanColor;
  }

  function render() {
    renderChrome();
    if (state.mode === 'insights') { renderInsightsView(); renderStatus(); return; }
    var results = classifyAll();
    if (train) { renderTrain(results); return; }
    var fen = fenAt(state.ply), pi = posInfo(fen), entry = an.entry(fen);
    var last = state.ply > 0 ? state.line[state.ply - 1] : null;
    var cls = last ? results[state.ply - 1] : null;
    var engineOn = showEngineNow();
    // Im KI-Modus bewertet die Karte deinen letzten Zug (die Antwort der KI steht darunter)
    var vIdx = state.ply - 1, reply = null;
    if (state.mode === 'play' && last && last.color !== state.settings.humanColor && state.ply >= 2) {
      vIdx = state.ply - 2; reply = { mv: last, cls: cls };
    }
    var s = state.settings;

    // Brett
    var arrows = [];
    if (engineOn && entry && entry.lines.length && !pi.terminal) {
      if (s.arrowAlt && entry.lines[1]) arrows.push(Object.assign(uciToMove(entry.lines[1].uci), { kind: 'alt', width: 12 }));
      if (s.arrowBest) arrows.push(Object.assign(uciToMove(entry.lines[0].uci), { kind: 'best' }));
    }
    if (s.arrowBetter && cls && cls.bestUci && /inaccuracy|mistake|blunder|miss/.test(cls.key) && engineOn) {
      arrows.unshift(Object.assign(uciToMove(cls.bestUci), { kind: 'better', width: 13 }));
    }
    var badge = null, tint = null;
    if (last && cls && cls.key) {
      var cat = C.CATS[cls.key];
      var pop = false;
      if (last.live && last.id > lastAnnounced && cls.depth >= ANNOUNCE_D && state.ply === state.line.length) {
        lastAnnounced = last.id;
        if (cls.key === 'brilliant' || cls.key === 'great') { pop = true; toast(cls.key); sound('brilliant'); }
      }
      if (s.badges) badge = { square: last.to, key: cls.key, sym: cat.sym, label: catLabel(cls.key), pop: pop };
      tint = cls.key;
    }
    var interactive = !pi.terminal && (state.mode === 'analyse' || state.mode === 'trainer' ||
      (state.ply === state.line.length && pi.turn === s.humanColor && !ai.thinking));
    if (animateNext) sound(pi.inCheck ? 'check' : animateNext.capture ? 'capture' : 'move');
    board.render({
      fen: fen, orientation: state.orientation, lastMove: last ? { from: last.from, to: last.to } : null,
      check: pi.king, arrows: arrows, badge: badge, tint: tint, animate: animateNext, interactive: interactive
    });
    animateNext = null;

    renderEval(fen, entry, pi, engineOn);
    renderPlayers(results);
    renderVerdict(vIdx >= 0 ? state.line[vIdx] : null, vIdx >= 0 ? results[vIdx] : null, pi, fen, entry, reply);
    renderEngine(fen, entry, pi, engineOn);
    renderMoves(results);
    renderReview(results);
    renderTrainerBox();
    renderStatus();
    renderControls(pi, entry, engineOn);
  }

  function toast(key, text) {
    var tEl = $('toast');
    tEl.hidden = true;
    tEl.className = 'toast c-' + key;
    tEl.textContent = text || (key === 'brilliant' ? t('Brillant!!') : t('Großartig!'));
    void tEl.offsetWidth;
    tEl.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { tEl.hidden = true; }, 2000);
  }

  function renderEval(fen, entry, pi, engineOn) {
    var wp = engineOn ? whiteWp(fen, entry) : null;
    var fill = $('evalFill'), numEl = $('evalNum'), bar = $('evalbar');
    bar.classList.toggle('flipped', state.orientation === 'b');
    var h = wp == null ? 50 : Math.max(2, Math.min(98, wp));
    fill.style.height = h + '%';
    var txt = '';
    if (engineOn) {
      if (pi.terminal === 'mate') txt = pi.turn === 'w' ? '0-1' : '1-0';
      else if (pi.terminal === 'draw') txt = '½';
      else if (entry && entry.lines.length) {
        var ws = whiteScore(fen, entry.lines[0].score);
        var pawns = Math.abs(ws.cp / 100);
        txt = ws.mate != null ? '#' + Math.abs(ws.mate) : pawns >= 10 ? String(Math.round(pawns)) : pawns.toFixed(1);
      }
    }
    numEl.textContent = txt;
    var whiteAhead = wp == null || wp >= 50;
    var atBottom = (state.orientation === 'w') === whiteAhead;
    numEl.className = 'evalbar-num ' + (atBottom ? 'bottom' : 'top');
    numEl.style.color = whiteAhead ? '#26292b' : '#f5f4ef';
  }

  function playerHtml(color, results) {
    var h = state.headers, name, meta = '';
    if (state.mode === 'play') {
      name = color === state.settings.humanColor ? t('Du') : 'Stockfish · ' + t(level().label).replace(/\s*\(.*\)/, '');
      if (color !== state.settings.humanColor && ai.thinking) meta = '<span class="meta thinking">' + t('denkt …') + '</span>';
    } else {
      name = color === 'w' ? (h.White && h.White !== '?' ? h.White : t('Weiß')) : (h.Black && h.Black !== '?' ? h.Black : t('Schwarz'));
      var elo = color === 'w' ? h.WhiteElo : h.BlackElo;
      if (elo && elo !== '?') name += ' (' + elo + ')';
      if (state.user && state.user.color === color) name += ' · ' + t('du');
    }
    var acc = accuracyFor(color, results);
    if (acc != null && state.line.length >= 4) meta += '<span class="acc-chip" title="' + esc(t('Genauigkeit')) + '">' + num1(acc) + '</span>';
    return '<span class="swatch ' + color + '"></span><span class="pname">' + esc(name) + '</span>' + (meta ? '<span class="meta">' + meta + '</span>' : '');
  }
  // Zusammenfassung nur neu berechnen, wenn sich Bewertungen geändert haben
  var sumCache = { sig: null, sum: null };
  function resultsSig(results) {
    var out = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      out += state.line[i].id + (r ? r.key + (r.accuracy == null ? '' : r.accuracy.toFixed(1)) : '-') + ',';
    }
    return out;
  }
  function summaryFor(results) {
    var sig = resultsSig(results);
    if (sumCache.sig !== sig) {
      sumCache.sig = sig;
      sumCache.sum = C.summarize(state.line.map(function (m, i) { return { color: m.color, cls: results[i] }; }));
    }
    return sumCache.sum;
  }
  // Genauigkeit erst, wenn alle Züge dieser Farbe bewertet sind
  function accuracyFor(color, results) {
    var sum = summaryFor(results);
    var total = state.line.filter(function (m) { return m.color === color; }).length;
    return total && sum[color].n === total ? sum[color].accuracy : null;
  }
  function renderPlayers(results) {
    var top = state.orientation === 'w' ? 'b' : 'w';
    $('playerTop').innerHTML = playerHtml(top, results);
    $('playerBottom').innerHTML = playerHtml(top === 'w' ? 'b' : 'w', results);
  }

  var PIECE = { p: 'Der Bauer', n: 'Der Springer', b: 'Der Läufer', r: 'Der Turm', q: 'Die Dame' };
  function reasonText(r) {
    var m = /^Matt in (\d+) ausgelassen$/.exec(r || '');
    if (m) return t('Matt in {n} ausgelassen', { n: m[1] });
    return t(r);
  }

  function verdictText(mv, cls, hasCoach) {
    var fb = mv.fenBefore;
    var best = cls.bestUci ? '<b>' + esc(nota(uciSan(fb, cls.bestUci))) + '</b>' : '';
    var bestEv = cls.bestScore ? fmtW(fb, cls.bestScore) : '';
    var lossTxt = cls.loss != null ? cls.loss.toFixed(0) : '0';
    switch (cls.key) {
      case 'brilliant':
        var what = cls.sac && PIECE[cls.sac.piece] ? t('{piece} auf {sq}', { piece: t(PIECE[cls.sac.piece]), sq: cls.sac.square }) : t('Material');
        return t('{what} wird geopfert – und Stockfish bestätigt: Das Opfer funktioniert.', { what: what }) + ' ' +
          t('Bewertung danach {ev}.', { ev: '<b>' + fmtW(fb, cls.playedScore) + '</b>' });
      case 'great':
        var sec = null;
        var eb = an.entry(fb);
        if (eb && eb.lines[1]) sec = nota(uciSan(fb, eb.lines[1].uci)) + ' (' + fmtW(fb, eb.lines[1].score) + ')';
        var wp = cls.wpBefore;
        var goal = wp >= C.THRESHOLDS.winWp ? t('Der einzige Zug, der den Vorteil hält.') :
          (wp > 100 - C.THRESHOLDS.winWp ? t('Der einzige Zug, der die Stellung im Gleichgewicht hält.') : t('Der einzige Zug, der noch Widerstand leistet.'));
        return goal + (sec ? ' ' + t('Der zweitbeste Zug {m} wäre klar schlechter.', { m: '<b>' + esc(sec) + '</b>' }) : '');
      case 'best':
        return t('Genau der Zug, den Stockfish empfiehlt. Bewertung {ev}.', { ev: '<b>' + fmtW(fb, cls.playedScore) + '</b>' });
      case 'excellent':
        return t('Fast so stark wie {m} ({ev}).', { m: best, ev: bestEv });
      case 'good':
        return t('Solide. Etwas genauer war {m} ({ev}).', { m: best, ev: bestEv });
      case 'book':
        var name = SK.book.display(SK.book.nameFor(fensUpTo(state.line.indexOf(mv) + 1)));
        return (name ? esc(name) : t('Bekannte Eröffnungstheorie')) + '.';
      case 'forced':
        return t('Der einzige legale Zug.');
      case 'miss':
        return (cls.reasons && cls.reasons[0] ? esc(reasonText(cls.reasons[0])) + '. ' : '') +
          t('Stark war {m} ({ev}). Gewinnchance −{loss} %.', { m: best, ev: bestEv, loss: lossTxt });
      default: // inaccuracy, mistake, blunder
        var thr = '';
        var ea = an.entry(mv.fenAfter);
        if ((cls.key === 'blunder' || cls.key === 'mistake') && ea && ea.lines[0] && !hasCoach) {
          thr = ' ' + t('Die Widerlegung: {pv}.', { pv: pvText(mv.fenAfter, ea.lines[0].pv, 4) });
        }
        return t('Besser war {m} ({ev}). Gewinnchance −{loss} %.', { m: best, ev: bestEv, loss: lossTxt }) + thr;
    }
  }
  function fensUpTo(ply) { var a = []; for (var i = 0; i <= ply; i++) a.push(fenAt(i)); return a; }

  function article(key) {
    return t({ brilliant: 'ist brillant', great: 'ist großartig', best: 'ist der beste Zug', excellent: 'ist exzellent',
               good: 'ist gut', book: 'ist Theorie', forced: 'war erzwungen', inaccuracy: 'ist eine Ungenauigkeit',
               mistake: 'ist ein Fehler', miss: 'verpasst eine Chance', blunder: 'ist ein Patzer' }[key]);
  }
  function moveLabel(mv) {
    var numv = posInfo(mv.fenBefore).fullmove;
    return numv + (mv.color === 'w' ? '. ' : '… ') + nota(mv.san);
  }

  function renderVerdict(last, cls, pi, fen, entry, reply) {
    var el = $('verdict'), html;
    if (pi.terminal) {
      var res = pi.terminal === 'mate' ? (pi.turn === 'w' ? t('Schwarz gewinnt') : t('Weiß gewinnt')) : t('Remis');
      var why = pi.terminal === 'mate' ? t('Schachmatt') : (pi.legal === 0 ? t('Patt') : t('Ungenügendes Material'));
      var head = last && cls ? '<span class="san">' + esc(moveLabel(last)) + '</span> ' + article(cls.key) + '. ' : '';
      html = '<div class="v-icon ' + (cls ? 'c-' + cls.key : 'neutral') + '">' + (cls ? C.CATS[cls.key].sym : '#') + '</div>' +
             '<div class="v-title">' + why + ' – ' + res + '</div>' +
             '<div class="v-text">' + head + (state.mode === 'play' ? t('Starte über „Neue Partie gegen KI“ die nächste Runde.') : '') + '</div>';
    } else if (!last) {
      var tip = entry && entry.lines.length ? nota(uciSan(fen, entry.lines[0].uci)) : null;
      html = '<div class="v-icon neutral">?</div>' +
             '<div class="v-title">' + (state.line.length ? t('Ausgangsstellung') : t('Mach einen Zug')) + '</div>' +
             '<div class="v-text">' + (state.line.length
               ? t('Blättere mit ← → durch die Partie; jeder Zug bekommt seine Bewertung.')
               : t('Zieh eine Figur auf dem Brett. Stockfish bewertet jeden Zug sofort – von brillant (!!) bis Patzer (??).')) +
               (tip && showEngineNow() ? ' ' + t('Stockfish empfiehlt hier {m}.', { m: '<b>' + esc(tip) + '</b>' }) : '') + '</div>';
    } else if (!cls) {
      html = '<div class="v-icon neutral">…</div>' +
             '<div class="v-title"><span class="san">' + esc(moveLabel(last)) + '</span></div>' +
             '<div class="v-text">' + (engine.state === 'ready' ? t('Stockfish bewertet den Zug …') : t('Wartet auf die Engine …')) + '</div>';
    } else {
      var cat = C.CATS[cls.key];
      var tips = coachFor(last, cls);
      html = '<div class="v-icon c-' + cls.key + '">' + cat.sym + '</div>' +
             '<div class="v-title"><span class="san">' + esc(moveLabel(last)) + '</span> ' + article(cls.key) + '</div>' +
             '<div class="v-text">' + verdictText(last, cls, tips.length > 0) + '</div>';
      if (tips.length) html += '<ul class="v-coach">' + tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      if (cls.wpBefore != null && cls.wpAfter != null && cls.key !== 'forced' && cls.key !== 'book') {
        var b = Math.round(cls.wpBefore), a = Math.round(cls.wpAfter);
        html += '<div class="v-wp" title="' + esc(t('Gewinnchance des ziehenden Spielers: mit dem besten Zug → mit dem gespielten Zug')) + '">' +
                t('Gewinnchance {b} % → {a} %', { b: b, a: a }) +
                '<span class="bar"><span class="before" style="width:' + b + '%"></span><span style="width:' + a + '%"></span></span></div>';
      }
      if (cls.key === 'brilliant' || cls.key === 'great') {
        html += '<div class="v-actions"><button type="button" class="btn ghost small" data-share="move">' + t('Zug teilen') + '</button></div>';
      }
    }
    if (reply && !pi.terminal) {
      html += '<div class="v-reply">' + t('Antwort der KI:') + ' <b>' + esc(moveLabel(reply.mv)) + '</b>' +
        (reply.cls ? ' <span class="sym c-' + reply.cls.key + '">' + C.CATS[reply.cls.key].sym + '</span> ' + catLabel(reply.cls.key) : '') + '</div>';
    }
    el.innerHTML = html;
  }

  function fmtNps(nps) {
    if (!nps) return '';
    if (I.lang() === 'en') return (nps >= 1e6 ? (nps / 1e6).toFixed(1) + 'M' : Math.round(nps / 1000) + 'k') + ' nodes/s';
    return (nps >= 1e6 ? (nps / 1e6).toFixed(1).replace('.', ',') + ' Mio.' : Math.round(nps / 1000) + ' Tsd.') + ' Knoten/s';
  }

  function renderEngine(fen, entry, pi, engineOn) {
    var bm = $('bestMove'), meta = $('engineMeta'), ul = $('lines');
    if (pi.terminal) {
      bm.innerHTML = pi.terminal === 'mate' ? t('Matt') : t('Remis');
      meta.textContent = ''; ul.innerHTML = '';
      return;
    }
    if (!engineOn) {
      bm.innerHTML = '<span class="ev">' + t('versteckt') + '</span>';
      meta.textContent = ai.thinking ? t('KI am Zug') : '';
      ul.innerHTML = '<li class="empty">' + t('Hinweise sind aus. Schalte sie oben unter „Hinweise zeigen“ ein.') + '</li>';
      return;
    }
    if (!entry || !entry.lines.length) {
      bm.innerHTML = '…';
      meta.textContent = engine.state === 'ready' ? t('rechnet …') : '';
      if (engine.state === 'failed') {
        ul.innerHTML = '<li class="empty engine-fail"><b>' + t('Stockfish konnte nicht geladen werden.') + '</b> ' +
          t('Prüfe die Internetverbindung und tippe auf „Nochmal versuchen“.') +
          '<button type="button" class="btn ghost small" id="btnRetryEngine">' + t('Nochmal versuchen') + '</button>' +
          '<small>' + t('Details: {d}', { d: esc(engine.log.join(' · ') || '–') }) + '</small></li>';
      } else if (engine.state !== 'ready') {
        var secs = Math.round((Date.now() - engineT0) / 1000);
        ul.innerHTML = '<li class="empty">' + t('Lade {x} … ({s} s, beim ersten Mal ca. 7 MB)', { x: esc(engineDetail || 'Stockfish'), s: secs }) + '</li>';
      } else ul.innerHTML = '<li class="empty">' + t('Stockfish rechnet …') + '</li>';
      return;
    }
    var top = entry.lines[0];
    bm.innerHTML = esc(nota(uciSan(fen, top.uci))) + ' <span class="ev">' + fmtW(fen, top.score) + '</span>';
    var nps = fmtNps(entry.nps);
    meta.innerHTML = t('Tiefe {d}', { d: entry.depth }) + (nps ? '<br>' + nps : '');
    var want = Math.max(1, +state.settings.lines);
    ul.innerHTML = entry.lines.slice(0, want).map(function (l) {
      var ws = whiteScore(fen, l.score);
      var neg = ws.mate != null ? ws.mate < 0 : ws.cp < 0;
      return '<li data-uci="' + l.uci + '" title="' + esc(t('Zug ausführen')) + '"><span class="ev-chip' + (neg ? ' neg' : '') + '">' + C.fmtScore(ws) + '</span>' +
             '<span class="pv">' + pvText(fen, l.pv, 12) + '</span></li>';
    }).join('');
  }

  var movesSig = '';
  function renderMoves(results) {
    var box = $('moves');
    var sig = state.ply + '|' + state.line.map(function (m, i) { var r = results[i]; return m.id + (r ? r.key : '-'); }).join(',') + '|' + state.settings.notation + '|' + I.lang();
    var op = state.line.length && bookStart() ? SK.book.display(SK.book.nameFor(fensUpTo(state.line.length))) : null;
    $('opening').textContent = op || '';
    if (sig === movesSig) return;
    movesSig = sig;
    if (!state.line.length) {
      box.innerHTML = '<div class="empty-sheet">' + t('Noch keine Züge. Zieh auf dem Brett oder lade über „Partie laden“ eine Partie.') + '</div>';
      return;
    }
    var html = '', first = state.line[0];
    var numv = posInfo(first.fenBefore).fullmove;
    var i = 0;
    if (first.color === 'b') {
      html += '<div class="no">' + numv + '</div><div class="mv"></div>' + cell(0);
      i = 1; numv++;
    }
    for (; i < state.line.length; i += 2) {
      html += '<div class="no">' + numv + '</div>' + cell(i) + (i + 1 < state.line.length ? cell(i + 1) : '<div class="mv"></div>');
      numv++;
    }
    var pi = posInfo(fenAt(state.line.length));
    if (pi.terminal) html += '<div class="result">' + (pi.terminal === 'mate' ? (pi.turn === 'w' ? '0–1' : '1–0') : '½–½') + '</div>';
    else if (state.headers.Result && state.headers.Result !== '*' && !state.main) html += '<div class="result">' + esc(state.headers.Result) + '</div>';
    box.innerHTML = html;
    var cur = box.querySelector('.mv.cur');
    if (cur) {
      var bt = box.getBoundingClientRect(), ct = cur.getBoundingClientRect();
      if (ct.top < bt.top || ct.bottom > bt.bottom) box.scrollTop += (ct.top - bt.top) - box.clientHeight / 2;
    }
    function cell(k) {
      var m = state.line[k], r = results[k];
      var sym = r && r.key ? '<span class="sym c-' + r.key + (/best|excellent|good|book|forced/.test(r.key) ? ' quiet' : '') + '" title="' + esc(catLabel(r.key)) + '">' + C.CATS[r.key].sym + '</span>'
                           : '<span class="pend" title="' + esc(t('wird bewertet')) + '">·</span>';
      return '<div class="mv' + (k === state.ply - 1 ? ' cur' : '') + '" data-ply="' + (k + 1) + '">' + esc(nota(m.san)) + sym + '</div>';
    }
  }

  function gameNames() {
    var h = state.headers;
    if (state.mode === 'play') return { w: state.settings.humanColor === 'w' ? t('Du') : 'Stockfish', b: state.settings.humanColor === 'b' ? t('Du') : 'Stockfish' };
    return { w: h.White && h.White !== '?' ? h.White : t('Weiß'), b: h.Black && h.Black !== '?' ? h.Black : t('Schwarz') };
  }

  function renderReview(results) {
    var n = state.line.length;
    $('review').hidden = n < 2 || state.mode === 'trainer';
    if (n < 2 || state.mode === 'trainer') return;
    var pr = an.reviewProgress();
    $('progress').textContent = !state.settings.autoReview ? t('automatisches Review aus')
      : (pr.done >= pr.total ? t('fertig · Tiefe {d}', { d: reviewDepth() }) : t('analysiert {a} / {b}', { a: pr.done, b: pr.total }));
    renderGraph(results);
    var names = gameNames();
    var sig = sumCache.sig + '|' + state.ply + '|' + I.lang() + '|' + names.w + '|' + names.b + '|' + state.orientation + '|' +
              (state.user ? state.user.color : '') + '|' + state.settings.notation + '|' + state.mode;
    if (sig === reviewSig) return;
    reviewSig = sig;
    var sum = summaryFor(results);
    function box(c, name) {
      var a = accuracyFor(c, results);
      return '<div class="box"><div class="who"><span class="swatch sm ' + c + '"></span>' + esc(name) + '</div>' +
             '<div class="num">' + (a == null ? '–' : num1(a)) + '<small>' + t('Genauigkeit') + '</small></div></div>';
    }
    $('acc').innerHTML = box('w', names.w) + box('b', names.b);
    var rows = C.ORDER.filter(function (k) { return k !== 'forced'; }).map(function (k) {
      var w = sum.w.counts[k], b = sum.b.counts[k];
      return '<tr><td class="n' + (w ? '' : ' zero') + '">' + w + '</td><td class="lab"><span class="sym c-' + k + '">' + C.CATS[k].sym + '</span>' + catLabel(k) + '</td><td class="n' + (b ? '' : ' zero') + '">' + b + '</td></tr>';
    }).join('');
    $('counts').innerHTML = '<thead><tr><td class="n">' + t('Weiß') + '</td><td></td><td class="n">' + t('Schwarz') + '</td></tr></thead><tbody>' + rows + '</tbody>';
    renderReviewExtras(results);
  }
  var reviewSig = '';

  // Bewertungsverlauf: Gewinnchance von Weiß pro Halbzug
  var graphHover = null, graphSig = '';
  function renderGraph(results) {
    var g = $('graph');
    var W = Math.max(200, g.clientWidth || 360), H = g.clientHeight || 104;
    var n = state.line.length;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = fenAt(i), wp = whiteWp(f, an.entry(f));
      pts.push(wp);
    }
    var gsig = pts.map(function (v) { return v == null ? '' : v.toFixed(1); }).join(',') + '|' + state.ply + '|' + graphHover + '|' + W + '|' + (sumCache.sig || '');
    if (gsig === graphSig) return;
    graphSig = gsig;
    function X(i2) { return n ? i2 / n * W : 0; }
    function Y(wp2) { return H - wp2 / 100 * H; }
    var d = '', started = false, lastX = 0;
    for (var k = 0; k <= n; k++) {
      if (pts[k] == null) continue;
      var x = X(k).toFixed(1), y = Y(Math.max(1, Math.min(99, pts[k]))).toFixed(1);
      if (!started) { d = 'M' + x + ',' + H + ' L' + x + ',' + y; started = true; }
      else d += ' L' + x + ',' + y;
      lastX = x;
    }
    if (started) d += ' L' + lastX + ',' + H + ' Z';
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(t('Bewertungsverlauf der Partie')) + '">' +
      (started ? '<path class="g-white" d="' + d + '"/>' : '') +
      '<line class="g-mid" x1="0" x2="' + W + '" y1="' + (H / 2) + '" y2="' + (H / 2) + '"/>' +
      '<line class="g-cur" x1="' + X(state.ply) + '" x2="' + X(state.ply) + '" y1="0" y2="' + H + '"/>';
    for (var j = 0; j < n; j++) {
      var r = results[j];
      if (!r || !/brilliant|great|blunder|mistake|miss/.test(r.key) || pts[j + 1] == null) continue;
      svg += '<circle class="g-dot" cx="' + X(j + 1).toFixed(1) + '" cy="' + Y(Math.max(4, Math.min(96, pts[j + 1]))).toFixed(1) + '" r="5" fill="var(--c-' + r.key + ')"/>';
    }
    if (graphHover != null) svg += '<line class="g-hover" x1="' + X(graphHover) + '" x2="' + X(graphHover) + '" y1="0" y2="' + H + '"/>';
    svg += '</svg>';
    var tip = '';
    if (graphHover != null && graphHover > 0) {
      var mv = state.line[graphHover - 1], rr = results[graphHover - 1];
      var f2 = fenAt(graphHover), e2 = an.entry(f2), pi2 = posInfo(f2);
      var ev = pi2.terminal ? (pi2.terminal === 'mate' ? '#' : '½') : (e2 && e2.lines[0] ? fmtW(f2, e2.lines[0].score) : '…');
      tip = '<div class="tip" style="left:' + Math.max(60, Math.min(W - 60, X(graphHover))) + 'px">' + esc(moveLabel(mv)) +
            (rr ? ' ' + C.CATS[rr.key].sym : '') + ' · ' + ev + '</div>';
    }
    g.innerHTML = svg + tip;
  }

  /* ---------- Coach-Erklärungen ---------- */

  var coachMemo = new Map();
  function coachFor(mv, cls) {
    if (!mv || !cls) return [];
    var ea = an.entry(mv.fenAfter);
    var k = mv.id + '|' + cls.key + '|' + (cls.depth || 0) + '|' + (ea ? ea.depth : 0) + '|' + state.settings.notation + '|' + I.lang();
    var hit = coachMemo.get(k);
    if (hit) return hit;
    var out = [];
    var tc = CO.parseTimeControl(state.headers.TimeControl);
    try {
      out = CO.explain({ fenBefore: mv.fenBefore, fenAfter: mv.fenAfter, move: mv, cls: cls, after: ea, lang: I.lang(),
                         notation: state.settings.notation, clock: { left: mv.clock, spent: mv.spent }, base: tc ? tc.base : null });
    } catch (e) { out = []; }
    if (coachMemo.size > 3000) coachMemo.clear();
    coachMemo.set(k, out);
    return out;
  }

  /* ---------- Review: Phasen, Schlüsselmomente, Zeit ---------- */

  function phaseStats(results) {
    var out = {};
    ['opening', 'middlegame', 'endgame'].forEach(function (ph) {
      out[ph] = {};
      ['w', 'b'].forEach(function (c) {
        var moves = [], done = true;
        state.line.forEach(function (m, i) {
          if (m.phase !== ph || m.color !== c) return;
          var r = results[i];
          if (!r) { done = false; return; }
          if (r.accuracy != null) moves.push(r.accuracy);
        });
        out[ph][c] = { n: moves.length, done: done,
                       acc: moves.length ? moves.reduce(function (a, b) { return a + b; }, 0) / moves.length : null };
      });
    });
    return out;
  }
  function grade(acc) {
    if (acc == null) return { cls: 'none', txt: '–' };
    if (acc >= 90) return { cls: 'top', txt: t('stark') };
    if (acc >= 80) return { cls: 'ok', txt: t('gut') };
    if (acc >= 65) return { cls: 'mid', txt: t('okay') };
    return { cls: 'low', txt: t('schwach') };
  }

  function renderReviewExtras(results) {
    // Phasen
    var ps = phaseStats(results), rows = '';
    ['opening', 'middlegame', 'endgame'].forEach(function (ph) {
      var w = ps[ph].w, b = ps[ph].b;
      if (!w.n && !b.n && w.done && b.done) return;
      function cell(x) {
        if (!x.done) return '<td class="ph-cell"><span class="ph-grade none">…</span></td>';
        var g = grade(x.acc);
        return '<td class="ph-cell"><span class="ph-grade ' + g.cls + '">' + (x.acc == null ? '–' : x.acc.toFixed(0)) + '</span><small>' + g.txt + '</small></td>';
      }
      rows += '<tr><td class="lab">' + t(CO.PHASES[ph]) + '</td>' + cell(w) + cell(b) + '</tr>';
    });
    $('phases').innerHTML = rows ? '<thead><tr><td></td><td class="ph-cell">' + t('Weiß') + '</td><td class="ph-cell">' + t('Schwarz') + '</td></tr></thead><tbody>' + rows + '</tbody>' : '';

    // Schlüsselmomente
    var items = [];
    state.line.forEach(function (m, i) {
      var r = results[i];
      if (!r || !/brilliant|great|miss|mistake|blunder/.test(r.key)) return;
      var tip = coachFor(m, r)[0] || '';
      var clock = m.clock != null ? '<span class="km-clock" title="' + esc(t('Restzeit nach dem Zug')) + '">' + CO.fmtClock(m.clock) + '</span>' : '';
      items.push('<li><button type="button" class="km' + (i === state.ply - 1 ? ' cur' : '') + '" data-ply="' + (i + 1) + '">' +
        '<span class="sym c-' + r.key + '">' + C.CATS[r.key].sym + '</span>' +
        '<span class="km-main"><b>' + esc(moveLabel(m)) + '</b> ' + catLabel(r.key) + (tip ? '<small>' + esc(tip) + '</small>' : '') + '</span>' +
        clock + '</button></li>');
    });
    $('moments').innerHTML = items.length ? items.join('') : '<li class="km-empty">' + t('Noch keine Schlüsselmomente – sie erscheinen, sobald die Züge bewertet sind.') + '</li>';

    // Zeit (nur mit Uhrzeiten aus der PGN)
    var hasClock = state.line.some(function (m) { return m.clock != null; });
    $('timeBox').hidden = !hasClock;
    if (hasClock) {
      var tc = CO.parseTimeControl(state.headers.TimeControl);
      var tm = { w: { spent: [], press: 0, fast: 0, err: 0 }, b: { spent: [], press: 0, fast: 0, err: 0 } };
      state.line.forEach(function (m, i) {
        var x = tm[m.color], r = results[i];
        if (m.spent != null) x.spent.push(m.spent);
        if (!r || !/mistake|blunder|miss/.test(r.key)) return;
        x.err++;
        var low = m.clock != null && (m.clock < 30 || (tc && m.clock < tc.base * 0.1));
        if (low) x.press++;
        else if (m.spent != null && m.spent <= 3) x.fast++;
      });
      var avg = function (a) { return a.length ? CO.fmtClock(a.reduce(function (p, q) { return p + q; }, 0) / a.length) : '–'; };
      $('timeStats').innerHTML =
        '<tr><td class="lab">' + t('Ø Bedenkzeit pro Zug') + '</td><td class="n">' + avg(tm.w.spent) + '</td><td class="n">' + avg(tm.b.spent) + '</td></tr>' +
        '<tr><td class="lab">' + t('Fehler in Zeitnot') + '</td><td class="n">' + tm.w.press + '/' + tm.w.err + '</td><td class="n">' + tm.b.press + '/' + tm.b.err + '</td></tr>' +
        '<tr><td class="lab">' + t('Fehler nach ≤ 3 s') + '</td><td class="n">' + tm.w.fast + '/' + tm.w.err + '</td><td class="n">' + tm.b.fast + '/' + tm.b.err + '</td></tr>';
    }

    // Training
    var tc2 = trainColor(), cand = trainItems(results, tc2);
    var btn = $('btnTrain');
    var rated = results.filter(function (r) { return r; }).length;
    btn.disabled = !cand.length;
    var mine = state.user && state.user.color === tc2;
    btn.textContent = !cand.length && rated < results.length ? t('Fehler-Training nach der Analyse')
      : !cand.length ? t('Keine Fehler von {c} zum Trainieren', { c: colorName(tc2) })
      : mine ? t('Meine Fehler trainieren ({n})', { n: cand.length }) : t('Fehler von {c} trainieren ({n})', { c: colorName(tc2), n: cand.length });
  }

  /* ---------- Fehler-Training: aktuelle Partie („Retry“) und Trainer (Wiederholung) ---------- */

  function trainColor() {
    if (state.user && state.user.color) return state.user.color;
    if (state.mode === 'play') return state.settings.humanColor;
    return state.orientation;
  }
  function trainItems(results, color) {
    var out = [];
    state.line.forEach(function (m, i) {
      var r = results[i];
      if (!r || m.color !== color || !r.bestUci || !/mistake|blunder|miss/.test(r.key)) return;
      out.push({ idx: i, fen: m.fenBefore, played: m, cls: r, color: m.color });
    });
    return out;
  }
  function beginTraining(items, source) {
    if (!items.length) return;
    cancelAI();
    train = { items: items, i: 0, attempt: null, status: 'try', msg: '', solved: 0, firstTry: true, hint: false, source: source };
    state.orientation = items[0].color;
    updateEngine(); render();
    var tc = $('verdict'); if (tc && tc.scrollIntoView) tc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function startTraining() { beginTraining(trainItems(classifyAll(), trainColor()), 'game'); }

  // Trainer: fällige Aufgaben aus allen analysierten Partien
  function trainerRemaining() {
    var lim = LIC.limits().trainerPerDay;
    return lim === Infinity || lim == null ? Infinity : Math.max(0, lim - LIC.dayCount('trainer'));
  }
  function startTrainer() {
    var rem = trainerRemaining();
    if (rem <= 0) { openPro('trainer'); return; }
    var due = SRS.due();
    if (!due.length) { render(); return; }
    var items = due.slice(0, Math.min(20, rem)).map(function (p) {
      return { fen: p.fen, played: p.played, cls: { key: p.key, bestUci: p.bestUci, wpBefore: p.wpBefore }, color: p.played.color, srsId: p.id, tags: p.tags || [] };
    });
    beginTraining(items, 'srs');
  }
  function stopTraining(silent) {
    if (!train) return;
    clearTimeout(train.timer);
    train = null;
    if (!silent) { updateEngine(); render(); }
  }
  // Aufgabe abschließen (gelöst, Lösung gezeigt oder übersprungen)
  function finishItem(correctFirstTry) {
    var it = train.items[train.i];
    if (it.done) return;
    it.done = true;
    if (train.source === 'srs') {
      SRS.answer(it.srsId, !!correctFirstTry);
      LIC.dayCount('trainer', 1);
    }
  }
  function trainNext() {
    if (!train) return;
    clearTimeout(train.timer);
    finishItem(false);
    train.i++; train.attempt = null; train.status = train.i >= train.items.length ? 'done' : 'try';
    train.msg = ''; train.firstTry = true; train.hint = false;
    if (train.source === 'srs' && train.status === 'try' && trainerRemaining() <= 0) { train.status = 'done'; train.limit = true; }
    if (train.items[train.i]) state.orientation = train.items[train.i].color;
    updateEngine(); render();
  }
  function trainMove(input) {
    var it = train.items[train.i];
    var mv = makeMove(it.fen, input);
    if (!mv) return;
    train.attempt = { uci: mv.uci, san: mv.san, fenAfter: mv.fenAfter, from: mv.from, to: mv.to };
    train.status = 'checking';
    animateNext = { from: mv.from, to: mv.to, capture: !!mv.captured };
    updateEngine(); judgeAttempt(); render();
  }
  // Gilt ein Versuch als gelöst? Höchstens 5 % Gewinnchance schlechter als der beste Zug.
  function judgeAttempt() {
    if (!train || train.status !== 'checking') return;
    var it = train.items[train.i], att = train.attempt;
    var eb = an.entry(it.fen);
    var bestWp = eb && eb.lines[0] && eb.depth >= MIN_D ? C.scoreWp(eb.lines[0].score) : it.cls.wpBefore;
    var wp = null;
    if (att.uci === it.played.uci) wp = -1; // der Partiezug selbst
    else if (att.uci === it.cls.bestUci) wp = bestWp != null ? bestWp : 100;
    else if (posInfo(att.fenAfter).terminal === 'mate') wp = 100;
    else if (posInfo(att.fenAfter).terminal === 'draw') wp = 50;
    else {
      var line = eb ? eb.lines.filter(function (l) { return l.uci === att.uci; })[0] : null;
      if (line && eb.depth >= MIN_D) wp = C.scoreWp(line.score);
      else {
        var ea = an.entry(att.fenAfter);
        if (!ea || ea.depth < MIN_D || !ea.lines.length) return; // weiter rechnen lassen
        wp = 100 - C.scoreWp(ea.lines[0].score);
      }
    }
    if (bestWp == null) bestWp = wp;
    var loss = wp < 0 ? 100 : Math.max(0, bestWp - wp);
    var san = nota(att.san);
    if (loss < 5) {
      train.status = 'right';
      var first = train.firstTry && !train.hint;
      if (first) train.solved++;
      finishItem(first);
      sound('brilliant');
      train.msg = att.uci === it.cls.bestUci ? t('{m} ist der beste Zug!', { m: san }) : t('{m} ist genauso gut – gelöst!', { m: san });
    } else {
      train.status = 'wrong'; train.firstTry = false;
      train.msg = wp < 0 ? t('{m} war der Zug aus der Partie. Such weiter.', { m: san }) : t('{m} kostet {l} % Gewinnchance. Versuch es nochmal.', { m: san, l: loss.toFixed(0) });
      train.timer = setTimeout(function () {
        if (!train || train.status !== 'wrong') return;
        train.attempt = null; train.status = 'try';
        updateEngine(); render();
      }, 1100);
    }
  }
  function trainReveal() {
    if (!train) return;
    clearTimeout(train.timer);
    var it = train.items[train.i];
    var mv = makeMove(it.fen, uciToMove(it.cls.bestUci));
    train.firstTry = false;
    finishItem(false);
    train.attempt = mv ? { uci: mv.uci, san: mv.san, fenAfter: mv.fenAfter, from: mv.from, to: mv.to } : null;
    train.status = 'shown';
    train.msg = t('Lösung: {m}.', { m: mv ? nota(mv.san) : it.cls.bestUci });
    if (mv) animateNext = { from: mv.from, to: mv.to, capture: !!mv.captured };
    updateEngine(); render();
  }

  var TAG_TEXT = { hanging: 'hängende Figur', mate_allowed: 'Matt übersehen', fork_allowed: 'Gabel übersehen', win_missed: 'Gewinn verpasst',
                   fork_missed: 'Gabel verpasst', mate_missed: 'Matt verpasst', time_trouble: 'Zeitnot', fast: 'zu schnell gespielt' };

  function renderTrain(results) {
    judgeAttempt();
    var tr = train, it = tr.items[tr.i];
    var fen = viewFen(), pi = posInfo(fen);
    var el = $('verdict'), html;
    if (tr.status === 'done' || !it) {
      var limitNote = tr.limit ? '<div class="v-hint">' + t('Das Tageslimit der kostenlosen Version ist erreicht. Mit Pro trainierst du unbegrenzt.') + '</div>' : '';
      html = '<div class="v-icon c-best">✓</div><div class="v-title">' + t('Training beendet') + '</div>' +
        '<div class="v-text">' + t('{a} von {b} auf Anhieb gelöst.', { a: '<b>' + tr.solved + '</b>', b: tr.items.filter(function (x) { return x.done; }).length || tr.items.length }) + '</div>' + limitNote +
        '<div class="v-actions">' + (tr.source === 'srs'
          ? (tr.limit ? '<button type="button" class="btn accent small" data-act="pro">' + t('Pro holen') + '</button>' : '<button type="button" class="btn accent small" data-act="again">' + t('Weiter trainieren') + '</button>')
          : '<button type="button" class="btn accent small" data-act="again">' + t('Nochmal') + '</button>') +
        '<button type="button" class="btn ghost small" data-act="stop">' + (tr.source === 'srs' ? t('Beenden') : t('Zurück zur Partie')) + '</button></div>';
      el.innerHTML = html;
      board.render({ fen: tr.items[tr.items.length - 1] ? tr.items[tr.items.length - 1].fen : fenAt(state.ply), orientation: state.orientation, lastMove: null, arrows: [], interactive: false });
    } else {
      var att = tr.attempt;
      var arrows = [];
      if (tr.status === 'right' || tr.status === 'shown') arrows.push(Object.assign(uciToMove(it.cls.bestUci), { kind: 'better' }));
      var badge = null;
      if (att && (tr.status === 'right' || tr.status === 'wrong' || tr.status === 'shown')) {
        badge = { square: att.to, key: tr.status === 'wrong' ? 'mistake' : 'best', sym: tr.status === 'wrong' ? '✕' : '✓', label: '' };
      }
      var prev = tr.source === 'game' && it.idx > 0 ? state.line[it.idx - 1] : null;
      if (animateNext) sound(animateNext.capture ? 'capture' : 'move');
      board.render({
        fen: fen, orientation: state.orientation,
        lastMove: att ? { from: att.from, to: att.to } : (prev ? { from: prev.from, to: prev.to } : null),
        check: pi.king, arrows: arrows, badge: badge, animate: animateNext,
        interactive: tr.status === 'try' && !pi.terminal
      });
      animateNext = null;
      var hintTxt = '';
      if (tr.hint) {
        var bm = makeMove(it.fen, uciToMove(it.cls.bestUci));
        var withPiece = { p: 'Zieh mit einem Bauern (von {sq}).', n: 'Zieh mit dem Springer (von {sq}).', b: 'Zieh mit dem Läufer (von {sq}).',
                          r: 'Zieh mit dem Turm (von {sq}).', q: 'Zieh mit der Dame (von {sq}).', k: 'Zieh mit dem König (von {sq}).' };
        if (bm) hintTxt = '<div class="v-hint">' + t('Tipp:') + ' ' + t(withPiece[bm.piece], { sq: bm.from }) + '</div>';
      }
      var tagTxt = it.tags && it.tags.length ? '<div class="v-hint">' + t('Thema:') + ' ' + it.tags.filter(function (x) { return TAG_TEXT[x]; }).map(function (x) { return t(TAG_TEXT[x]); }).join(', ') + '</div>' : '';
      var checking = tr.status === 'checking' ? t('Stockfish prüft …') : '';
      var title = tr.source === 'srs' ? t('Taktik-Trainer · {a} von {b}', { a: tr.i + 1, b: tr.items.length }) : t('Fehler-Training · {a} von {b}', { a: tr.i + 1, b: tr.items.length });
      html = '<div class="v-icon c-' + it.cls.key + '">' + C.CATS[it.cls.key].sym + '</div>' +
        '<div class="v-title">' + title + '</div>' +
        '<div class="v-text">' + t('In der Partie kam {m} ({k}). Finde einen besseren Zug für {c}.', {
          m: '<b>' + esc(moveLabel(it.played)) + '</b>', k: catLabel(it.cls.key), c: colorName(it.color) }) + '</div>' +
        (tr.msg ? '<div class="v-msg ' + tr.status + '">' + esc(tr.msg) + '</div>' : (checking ? '<div class="v-msg">' + checking + '</div>' : '')) +
        hintTxt + (tr.status === 'shown' || tr.status === 'right' ? tagTxt : '') +
        '<div class="v-actions">' +
        (tr.status === 'right' || tr.status === 'shown'
          ? '<button type="button" class="btn accent small" data-act="next">' + (tr.i + 1 < tr.items.length ? t('Nächste Aufgabe') : t('Auswertung')) + '</button>'
          : '<button type="button" class="btn ghost small" data-act="hint"' + (tr.hint ? ' disabled' : '') + '>' + t('Tipp') + '</button>' +
            '<button type="button" class="btn ghost small" data-act="show">' + t('Lösung zeigen') + '</button>' +
            '<button type="button" class="btn ghost small" data-act="next">' + t('Überspringen') + '</button>') +
        '<button type="button" class="btn ghost small" data-act="stop">' + t('Beenden') + '</button></div>';
      el.innerHTML = html;
    }
    // Engine-Hinweise würden die Lösung verraten
    $('bestMove').innerHTML = '<span class="ev">' + t('im Training verborgen') + '</span>';
    $('engineMeta').textContent = '';
    $('lines').innerHTML = '<li class="empty">' + t('Während des Trainings ausgeblendet.') + '</li>';
    renderEval(fen, null, pi, false);
    renderPlayers(results);
    renderMoves(results);
    renderReview(results);
    renderTrainerBox();
    renderStatus();
    renderControls(pi, null, false);
  }

  function renderTrainerBox() {
    var box = $('trainerBox');
    box.hidden = state.mode !== 'trainer' || !!train;
    var st = SRS.stats();
    var cnt = $('trainerCount');
    cnt.hidden = !st.due; cnt.textContent = st.due > 99 ? '99+' : String(st.due);
    if (box.hidden) return;
    $('trStats').innerHTML =
      '<div><b>' + st.due + '</b><span>' + t('fällig') + '</span></div>' +
      '<div><b>' + st.learned + '</b><span>' + t('gelernt') + '</span></div>' +
      '<div><b>' + st.total + '</b><span>' + t('gesamt') + '</span></div>';
    var rem = trainerRemaining(), txt;
    if (!st.total) txt = t('Noch keine Aufgaben. Analysiere deine Partien unter „Insights“ oder lade eine Partie – deine Fehler werden automatisch zu Aufgaben.');
    else if (!st.due) {
      var next = SRS.all().reduce(function (m, p) { return Math.min(m, p.due); }, Infinity);
      txt = t('Alles erledigt. Die nächste Wiederholung ist am {d} fällig.', { d: I.date(next, true) });
    } else txt = t('Jede Aufgabe ist eine Stellung aus deinen eigenen Partien. Gelöste Aufgaben kommen nach 1, 3, 7, 14 … Tagen wieder.');
    if (rem !== Infinity) txt += ' ' + t('Kostenlos: noch {n} Aufgaben heute.', { n: rem });
    $('trText').textContent = txt;
    $('btnTrainerStart').disabled = !st.due;
  }

  /* ---------- Konnektor: deine beendeten Partien ---------- */

  var conn = { games: [], busy: false, timer: null, lastCheck: 0 };
  function connStatus(txt, kind) {
    var el = $('connStatus');
    el.textContent = txt || '';
    el.dataset.kind = kind || '';
  }
  function siteName(site) { return site === 'lichess' ? 'lichess' : 'chess.com'; }
  function connFetch(limit) {
    var s = state.settings;
    return SK.connect.fetchGames(s.connSite, s.connUser, { limit: limit || 20, months: limit > 30 ? 6 : 2 });
  }
  function connErrorText(e) {
    var site = siteName(state.settings.connSite);
    switch (e && e.code) {
      case 'blocked': return t('Diese Seite darf keine Verbindung zu {s} aufbauen. Öffne Zugradar über die eigene Website oder lokal (siehe README). Alternativ: PGN einfügen.', { s: site });
      case 'notfound': return t('Benutzer nicht gefunden.');
      case 'ratelimit': return t('Zu viele Anfragen – bitte eine Minute warten.');
      case 'network': return t('Keine Verbindung zu {s}.', { s: site });
      case 'input': return t('Bitte einen Benutzernamen eingeben.');
      default: return (e && e.message) || t('Unbekannter Fehler.');
    }
  }
  function connLoadList() {
    var s = state.settings;
    s.connUser = $('connUser').value.trim();
    s.connSite = $('connSite').value;
    save();
    if (!s.connUser) { connStatus(t('Bitte deinen Benutzernamen eingeben.'), 'error'); return; }
    conn.busy = true;
    connStatus(t('Lade Partien von {s} …', { s: siteName(s.connSite) }), 'busy');
    $('connGames').innerHTML = '';
    connFetch(20).then(function (games) {
      conn.busy = false; conn.games = games; conn.lastCheck = Date.now();
      if (games.length && !s.connLast) { s.connLast = games[0].end; save(); }
      connStatus(games.length ? t('{n} beendete Partien von {u}.', { n: games.length, u: s.connUser }) : t('Keine beendeten Partien gefunden.'), games.length ? 'ok' : '');
      renderGames();
    }, function (e) {
      conn.busy = false;
      connStatus(connErrorText(e), 'error');
    });
  }
  function fmtTc(tc) {
    var x = CO.parseTimeControl(tc);
    if (!x) return tc ? t('Fernschach') : '';
    return (x.base >= 60 ? Math.round(x.base / 60) : x.base + ' s') + '+' + x.inc;
  }
  function speedName(sp) { var d = SK.connect.SPEED[sp]; return d ? t(d) : (sp || ''); }
  function renderGames() {
    var ul = $('connGames');
    ul.innerHTML = conn.games.map(function (g, i) {
      var me = g.userColor, opp = me === 'b' ? g.white : g.black;
      var res = g.userResult === 'win' ? [t('S'), 'win', t('Sieg')] : g.userResult === 'loss' ? [t('N'), 'loss', t('Niederlage')] : g.userResult === 'draw' ? [t('R'), 'draw', t('Remis')] : ['·', 'draw', g.result];
      return '<li><button type="button" class="game" data-i="' + i + '">' +
        '<span class="res ' + res[1] + '" title="' + esc(res[2]) + '">' + res[0] + '</span>' +
        '<span class="g-main"><b>' + (me ? t('vs.') + ' ' : '') + esc(me ? opp.name : g.white.name + ' – ' + g.black.name) + (me && opp.rating ? ' (' + opp.rating + ')' : '') + '</b>' +
        '<small>' + [speedName(g.speed), fmtTc(g.timeControl), me ? (me === 'w' ? t('mit Weiß') : t('mit Schwarz')) : '', I.date(g.end, true)].filter(Boolean).join(' · ') + '</small></span>' +
        '<span class="g-go">' + t('Analysieren') + '</span></button></li>';
    }).join('');
  }
  function loadGame(g, silent) {
    var err = importText(g.pgn, {
      user: g.userColor ? { name: g.userColor === 'w' ? g.white.name : g.black.name, color: g.userColor } : null,
      game: { site: g.site, id: g.id, url: g.url, end: g.end, speed: g.speed, timeControl: g.timeControl, white: g.white, black: g.black, result: g.result, userResult: g.userResult }, ply: 0
    });
    if (err) { connStatus(err, 'error'); return false; }
    if (!silent) closeImport();
    return true;
  }
  // Auto-Import: prüft jede Minute, ob eine NEUE, BEENDETE Partie dazugekommen ist (Pro)
  function connSchedule() {
    clearInterval(conn.timer); conn.timer = null;
    var s = state.settings;
    var on = s.connAuto && s.connUser && LIC.limits().autoImport;
    $('autoChip').hidden = !on;
    if (!on) return;
    $('autoChip').textContent = t('Auto-Import · {u}', { u: s.connUser });
    conn.timer = setInterval(connPoll, 60000);
  }
  function connPoll() {
    var s = state.settings;
    if (!(s.connAuto && s.connUser) || conn.busy || !LIC.limits().autoImport) return;
    if (document.hidden) return;
    conn.busy = true;
    connFetch(5).then(function (games) {
      conn.busy = false; conn.lastCheck = Date.now();
      var fresh = games.filter(function (g) { return g.end > (s.connLast || 0); });
      if (!fresh.length) { connStatus(t('Zuletzt geprüft {d} – keine neue Partie.', { d: I.date(conn.lastCheck, true) }), ''); return; }
      var g = fresh[0];
      s.connLast = g.end; save();
      conn.games = games; renderGames();
      // Nicht mitten in einer Partie gegen die KI, im Training oder in einer Serie überschreiben
      if (state.mode === 'play' || train || batch.running) { connStatus(t('Neue Partie verfügbar – öffne „Partie laden“, um sie zu analysieren.'), 'ok'); return; }
      if (loadGame(g, true)) {
        toast('great', t('Neue Partie geladen'));
        connStatus(t('Neue Partie automatisch geladen: {d}.', { d: I.date(g.end, true) }), 'ok');
      }
    }, function (e) {
      conn.busy = false;
      connStatus(connErrorText(e), 'error');
      if (e && e.code === 'blocked') { s.connAuto = false; $('connAuto').checked = false; save(); connSchedule(); }
    });
  }

  /* ---------- Bibliothek: fertig analysierte Partie speichern ---------- */

  var savedFor = null;
  function currentGameKey() {
    if (!state.line.length || state.main || state.sample) return null;
    if (!state.game && !state.pgn) return null; // nur geladene Partien, keine Spielereien auf dem Brett
    return (state.game ? state.game.site + ':' + state.game.id : 'pgn') + '|' + state.line.length + '|' + state.line[0].id;
  }
  function saveCurrentIfDone() {
    var key = currentGameKey();
    if (!key || savedFor === key || state.line.length < 6 || !state.settings.autoReview) return;
    var need = reviewDepth();
    for (var i = 0; i <= state.line.length; i++) {
      var f = fenAt(i);
      if (!posInfo(f).terminal && !an.ready(f, need)) return;
    }
    var entry = LIB.entryFrom(state.game, state.pgn || exportPgn(), state.headers);
    if (state.user && state.user.color && !entry.userColor) {
      entry.userColor = state.user.color;
      var r = state.headers.Result;
      entry.userResult = r === '1/2-1/2' ? 'draw' : r === '1-0' ? (entry.userColor === 'w' ? 'win' : 'loss') : r === '0-1' ? (entry.userColor === 'b' ? 'win' : 'loss') : null;
    }
    var tc = state.headers.TimeControl || (state.game && state.game.timeControl);
    var analysis = INS.analyzeGame(state.line, function (f2) { return an.entry(f2); },
      { minDepth: MIN_D, depth: reviewDepth(), timeControl: tc, gameId: entry.id, userColor: entry.userColor, terminal: terminalOf });
    if (!analysis) return;
    savedFor = key;
    entry.analysis = analysis; entry.opening = analysis.opening;
    var old = LIB.get(entry.id);
    if (old && old.analysis && old.analysis.depth > analysis.depth) return; // tiefere Analyse behalten
    LIB.put(entry);
    if (entry.userColor) SRS.add(analysis.puzzles);
    insightsDirty = true;
  }

  /* ---------- Serien-Analyse für Insights ---------- */

  var batch = { running: false, list: [], idx: 0, cur: null, done: 0, skipped: 0, msg: '' };
  var insightsDirty = true;
  function batchStart() {
    var s = state.settings;
    if (!s.connUser) {
      openImport('games');
      connStatus(t('Gib deinen Benutzernamen ein – dann analysiert Zugradar deine letzten Partien.'), 'error');
      return;
    }
    var want = +$('insCount').value || 20, lim = LIC.limits().insightsGames || 5;
    if (want > lim) { openPro('insights'); want = lim; }
    batch = { running: true, list: [], idx: 0, cur: null, done: 0, skipped: 0, msg: t('Lade Partien von {s} …', { s: siteName(s.connSite) }) };
    render();
    connFetch(want).then(function (games) {
      if (!batch.running) return;
      var todo = games.filter(function (g) {
        var e = LIB.get(g.site + ':' + g.id);
        return !(e && e.analysis && e.analysis.depth >= BATCH_D);
      });
      batch.skipped = games.length - todo.length;
      batch.list = todo;
      if (!games.length) batch.msg = t('Keine beendeten Partien gefunden.');
      batchNext();
    }, function (e) {
      batch.running = false; batch.msg = connErrorText(e);
      render();
    });
  }
  function batchNext() {
    if (!batch.running) return;
    if (batch.idx >= batch.list.length) { batchFinish(); return; }
    var g = batch.list[batch.idx];
    var p = parsePgn(g.pgn);
    if (p.error || !p.sans.length) { batch.failed = (batch.failed || 0) + 1; batch.idx++; batchNext(); return; }
    var line = lineFromParsed(p);
    var fens = [line.length ? line[0].fenBefore : p.start].concat(line.map(function (m) { return m.fenAfter; }));
    var entry = LIB.entryFrom(g, g.pgn, p.headers);
    batch.cur = { game: g, line: line, fens: fens, entry: entry, tc: g.timeControl || p.headers.TimeControl };
    batch.msg = '';
    updateEngine();
    batchCheck();
    soon();
  }
  function batchCheck() {
    var cur = batch.cur;
    if (!batch.running || !cur) return;
    for (var i = 0; i < cur.fens.length; i++) {
      if (!posInfo(cur.fens[i]).terminal && !an.ready(cur.fens[i], BATCH_D)) return;
    }
    var analysis = INS.analyzeGame(cur.line, function (f) { return an.entry(f); },
      { minDepth: BATCH_D, depth: BATCH_D, timeControl: cur.tc, gameId: cur.entry.id, userColor: cur.entry.userColor, terminal: terminalOf });
    batch.cur = null;
    if (analysis) {
      cur.entry.analysis = analysis; cur.entry.opening = analysis.opening;
      LIB.put(cur.entry);
      if (cur.entry.userColor) SRS.add(analysis.puzzles);
      batch.done++;
    }
    insightsDirty = true;
    batch.idx++;
    setTimeout(batchNext, 0);
  }
  function batchFinish() {
    batch.running = false; batch.cur = null;
    batch.msg = batch.done || batch.skipped
      ? t('Fertig: {a} Partien neu analysiert, {b} waren schon analysiert.', { a: batch.done, b: batch.skipped })
      : batch.msg;
    if (batch.failed) batch.msg += ' ' + t('Nicht lesbar: {n} Partie(n).', { n: batch.failed });
    updateEngine(); insightsDirty = true; render();
  }
  function batchCancel() {
    batch.running = false; batch.cur = null; batch.msg = t('Abgebrochen.');
    updateEngine(); render();
  }

  /* ---------- Insights-Ansicht ---------- */

  var WEAK = {
    hanging: ['Hängende Figuren', '{c} von {n} Fehlern ließen eine Figur ungedeckt stehen. Frag dich vor jedem Zug: Was kann mein Gegner jetzt schlagen?'],
    tactics_missed: ['Verpasste Taktik', '{c} von {n} Fehlern waren verpasste Gewinne – Gabeln, Materialgewinn oder Matt. Genau diese Stellungen übt der Trainer.'],
    mate_allowed: ['Mattgefahr übersehen', '{c} Fehler ließen ein Matt zu. Prüfe vor jedem Zug alle Schachgebote und Schlagzüge des Gegners.'],
    fork_allowed: ['Gabeln zugelassen', '{c} Fehler erlaubten eine Gabel. Achte auf Springerfelder und ungedeckte Figuren, die gleichzeitig angegriffen werden können.'],
    time_trouble: ['Zeitnot', '{c} von {n} Fehlern passierten mit weniger als 30 Sekunden auf der Uhr. Spiel die Eröffnung zügiger, damit Zeit für die kritischen Momente bleibt.'],
    too_fast: ['Zu schnell gespielt', '{c} von {n} Fehlern kamen nach höchstens 3 Sekunden. Nimm dir in kritischen Momenten bewusst zehn Sekunden.'],
    endgame: ['Endspiel', 'Im Endspiel spielst du mit {a} % deutlich ungenauer als im Schnitt ({o} %). Übe Grundendspiele: Turm-, Bauern- und Damenendspiele.'],
    opening_phase: ['Eröffnung', 'In der Eröffnung liegt deine Genauigkeit bei {a} % (sonst {o} %). Lerne die ersten acht bis zehn Züge deiner Hauptsysteme.'],
    opening: ['Schwache Eröffnung', 'Mit {name} ({color}) holst du nur {s} der Punkte aus {g} Partien. Lerne die typischen Pläne oder wechsle das System.'],
    blunders: ['Patzer', 'Im Schnitt {b} Patzer pro Partie. Ein kurzer Blunder-Check vor jedem Zug halbiert das oft.']
  };
  var TAG_LABEL = { hanging: 'Figur ungedeckt gelassen', mate_allowed: 'Matt zugelassen', fork_allowed: 'Gabel zugelassen',
                    win_missed: 'Materialgewinn verpasst', fork_missed: 'Gabel verpasst', mate_missed: 'Matt verpasst',
                    time_trouble: 'in Zeitnot', fast: 'nach ≤ 3 s gespielt' };

  function insightsEntries() {
    var all = LIB.all().filter(function (e) { return e.analysis && e.userColor; });
    all.sort(function (a, b) { return b.end - a.end; });
    var lim = LIC.limits().insightsGames || 5;
    return { shown: all.slice(0, lim), total: all.length, limit: lim };
  }

  function renderInsightsView() {
    var ent = insightsEntries();
    var r = INS.aggregate(ent.shown);
    var user = state.settings.connUser;
    $('insSub').textContent = ent.total
      ? t('Aus {n} analysierten Partien{u}.', { n: ent.shown.length, u: user ? ' ' + t('von {u}', { u: user }) : '' })
      : t('Noch keine Daten – starte mit deinen letzten Partien.');
    $('insRun').hidden = batch.running; $('insCancel').hidden = !batch.running;
    var prog = $('insProgress');
    prog.hidden = !batch.running && !batch.msg;
    if (batch.running && batch.list.length) {
      var cur = batch.cur, part = 0;
      if (cur) { var ready = cur.fens.filter(function (f) { return posInfo(f).terminal || an.ready(f, BATCH_D); }).length; part = ready / cur.fens.length; }
      var frac = (batch.idx + part) / batch.list.length;
      $('insBar').style.width = Math.round(frac * 100) + '%';
      $('insProgText').textContent = t('Analysiere Partie {a} von {b} …', { a: Math.min(batch.idx + 1, batch.list.length), b: batch.list.length });
    } else {
      $('insBar').style.width = batch.running ? '4%' : '100%';
      $('insProgText').textContent = batch.msg || '';
    }
    if (!insightsDirty) return;
    insightsDirty = false;
    var body = $('insBody');
    if (!r.n) {
      body.innerHTML = '<div class="ins-empty card">' +
        '<h2>' + t('So füllst du deine Insights') + '</h2><ol>' +
        '<li>' + t('Unter „Partie laden → Meine Partien“ deinen chess.com- oder lichess-Namen eintragen.') + '</li>' +
        '<li>' + t('Hier auf „Partien analysieren“ tippen. Stockfish bewertet jede Partie im Hintergrund.') + '</li>' +
        '<li>' + t('Deine Baustellen erscheinen hier, deine Fehler werden zu Aufgaben im Trainer.') + '</li></ol>' +
        '<button type="button" class="btn accent" data-ins="user">' + t('Benutzernamen eintragen') + '</button></div>';
      return;
    }
    var html = '';
    if (ent.total > ent.shown.length) {
      html += '<div class="ins-upsell"><span>' + t('Kostenlos siehst du Insights über deine letzten {n} Partien. Pro wertet bis zu {m} aus.', { n: ent.limit, m: (CFG.pro || {}).insightsGames || 100 }) + '</span>' +
        '<button type="button" class="btn accent small" data-ins="pro">' + t('Pro holen') + '</button></div>';
    }
    // Kennzahlen
    var delta = r.trendDelta;
    var trend = delta == null ? '' : '<small class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '▲ ' : '▼ ') + num1(Math.abs(delta)) + ' ' + t('zu den 5 Partien davor') + '</small>';
    html += '<div class="kpis">' +
      kpi(t('Ø Genauigkeit'), num1(r.acc), trend) +
      kpi(t('Punkte'), pct(r.score), '<small>' + t('{w} S · {d} R · {l} N', { w: r.wins, d: r.draws, l: r.losses }) + '</small>') +
      kpi(t('Patzer pro Partie'), num1(r.perGame.blunder), '<small>' + t('Fehler: {m} · Verpasst: {x}', { m: num1(r.perGame.mistake), x: num1(r.perGame.miss) }) + '</small>') +
      kpi(t('Brillante Züge'), String(r.highlights.brilliant), '<small>' + t('Großartig: {g}', { g: r.highlights.great }) + '</small>') +
      '</div>';
    // Baustellen + Stärken
    html += '<div class="ins-grid">';
    html += '<section class="card ins-weak"><h2>' + t('Deine drei Baustellen') + '</h2>';
    if (!r.weaknesses.length) html += '<p class="muted">' + t('Keine klare Schwäche erkennbar – analysiere mehr Partien für ein genaueres Bild.') + '</p>';
    r.weaknesses.forEach(function (w, i) {
      var def = WEAK[w.id];
      if (!def) return;
      var p = { c: w.count, n: w.of, a: w.acc != null ? num1(w.acc) : '', o: w.overall != null ? num1(w.overall) : '',
                name: w.name ? SK.book.display(w.name) : '', color: w.color ? colorName(w.color) : '', s: w.score != null ? pct(w.score) : '', g: w.n, b: w.perGame != null ? num1(w.perGame) : '' };
      html += '<div class="weak"><span class="rank">' + (i + 1) + '</span><div><h3>' + esc(t(def[0])) + '</h3><p>' + esc(t(def[1], p)) + '</p></div></div>';
    });
    var srsSt = SRS.stats();
    html += '<div class="ins-cta"><button type="button" class="btn accent" data-ins="trainer">' + t('Im Trainer üben') + (srsSt.due ? ' (' + srsSt.due + ')' : '') + '</button></div>';
    html += '</section>';
    html += '<section class="card"><h2>' + t('Genauigkeit pro Partie') + '</h2>' + accChart(r.trend) +
      '<div class="legend"><span><i class="lg win"></i>' + t('Sieg') + '</span><span><i class="lg draw"></i>' + t('Remis') + '</span><span><i class="lg loss"></i>' + t('Niederlage') + '</span></div></section>';
    html += '<section class="card"><h2>' + t('Phasen') + '</h2>' + bars([
      { label: t('Eröffnung'), v: r.phases.opening.acc, max: 100, fmt: num1 },
      { label: t('Mittelspiel'), v: r.phases.middlegame.acc, max: 100, fmt: num1 },
      { label: t('Endspiel'), v: r.phases.endgame.acc, max: 100, fmt: num1 }]) +
      '<p class="muted small">' + t('Ø Genauigkeit deiner Züge je Partiephase.') + '</p>';
    if (r.strengths.length) {
      html += '<h3 class="sub-head">' + t('Stärken') + '</h3><ul class="strengths">' + r.strengths.map(function (s) {
        if (s.id === 'phase') return '<li>' + t('Dein bestes Spiel zeigst du im {p} ({a} %).', { p: t(CO.PHASES[s.phase]), a: num1(s.acc) }) + '</li>';
        if (s.id === 'opening') return '<li>' + t('{name} mit {c}: {s} der Punkte.', { name: esc(SK.book.display(s.name)), c: colorName(s.color), s: pct(s.score) }) + '</li>';
        return '<li>' + t('{n} brillante Züge gefunden.', { n: s.count }) + '</li>';
      }).join('') + '</ul>';
    }
    html += '</section>';
    var tagRows = Object.keys(TAG_LABEL).map(function (k) { return { label: t(TAG_LABEL[k]), v: r.tags[k] || 0 }; })
      .filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    var maxTag = tagRows.reduce(function (m, x) { return Math.max(m, x.v); }, 1);
    html += '<section class="card"><h2>' + t('Fehlermuster') + '</h2>' +
      (tagRows.length ? bars(tagRows.map(function (x) { return { label: x.label, v: x.v, max: maxTag, fmt: String }; })) : '<p class="muted">' + t('Noch keine Fehler mit erkennbarem Muster.') + '</p>') +
      '<p class="muted small">' + t('Bei {n} eigenen Fehlern, Patzern und verpassten Chancen.', { n: r.errors }) + '</p></section>';
    html += '<section class="card ins-wide"><h2>' + t('Eröffnungen') + '</h2>' + openingsTable(r.openings) + '</section>';
    html += '<section class="card ins-wide"><h2>' + t('Analysierte Partien') + '</h2>' + gamesList(ent.shown) + '</section>';
    html += '</div>';
    body.innerHTML = html;
  }
  function kpi(label, value, extra) {
    return '<div class="kpi card"><span class="kpi-label">' + label + '</span><span class="kpi-value">' + value + '</span>' + (extra || '') + '</div>';
  }
  function bars(rows) {
    return '<div class="hbars">' + rows.map(function (r) {
      var w = r.v == null ? 0 : Math.max(2, Math.min(100, r.v / r.max * 100));
      return '<div class="hbar"><span class="hb-label">' + esc(r.label) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + w + '%"></span></span>' +
        '<span class="hb-val">' + (r.v == null ? '–' : r.fmt(r.v)) + '</span></div>';
    }).join('') + '</div>';
  }
  // Säulen: Genauigkeit je Partie (älteste links), Farbe = Ergebnis
  function accChart(trend) {
    var pts = trend.slice(-30), n = pts.length;
    if (!n) return '';
    var W = 600, H = 150, pad = 26, bw = Math.min(28, (W - pad) / n - 4);
    var svg = '<svg class="accchart" viewBox="0 0 ' + W + ' ' + (H + 20) + '" role="img" aria-label="' + esc(t('Genauigkeit pro Partie')) + '">';
    [50, 75, 100].forEach(function (g) {
      var y = H - g / 100 * H + 4;
      svg += '<line class="ac-grid" x1="' + pad + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="ac-ax" x="0" y="' + (y + 4) + '">' + g + '</text>';
    });
    pts.forEach(function (p, i) {
      var x = pad + i * ((W - pad) / n) + 2, a = p.acc == null ? 0 : p.acc, h = Math.max(3, a / 100 * H);
      var cls = p.result === 'win' ? 'win' : p.result === 'loss' ? 'loss' : 'draw';
      var tip = I.date(p.end) + ' · ' + t('vs.') + ' ' + (p.opp && p.opp.name || '?') + ' · ' + (p.acc == null ? '–' : num1(p.acc));
      svg += '<g class="ac-bar" data-game="' + esc(p.id) + '"><title>' + esc(tip) + '</title><rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + (H - h + 4).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/></g>';
    });
    return svg + '</svg>';
  }
  function openingsTable(list) {
    var rows = list.filter(function (o) { return o.name !== '—'; }).slice(0, 8);
    if (!rows.length) return '<p class="muted">' + t('Noch keine Eröffnungen erkannt.') + '</p>';
    return '<div class="tbl-wrap"><table class="otable"><thead><tr><th>' + t('Eröffnung') + '</th><th>' + t('Farbe') + '</th><th>' + t('Partien') + '</th><th>' + t('Punkte') + '</th><th>' + t('Genauigkeit') + '</th></tr></thead><tbody>' +
      rows.map(function (o) {
        return '<tr><td>' + esc(SK.book.display(o.name)) + '</td><td><span class="swatch sm ' + o.color + '"></span></td><td class="n">' + o.n + '</td>' +
          '<td class="n ' + (o.score >= 0.55 ? 'good' : o.score < 0.4 ? 'bad' : '') + '">' + pct(o.score) + '</td><td class="n">' + num1(o.acc) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function gamesList(list) {
    return '<ul class="lib">' + list.slice(0, 30).map(function (e) {
      var me = e.userColor, opp = me === 'w' ? e.black : e.white;
      var res = e.userResult === 'win' ? [t('S'), 'win'] : e.userResult === 'loss' ? [t('N'), 'loss'] : [t('R'), 'draw'];
      var acc = e.analysis && e.analysis.acc ? e.analysis.acc[me] : null;
      return '<li><button type="button" class="game" data-lib="' + esc(e.id) + '"><span class="res ' + res[1] + '">' + res[0] + '</span>' +
        '<span class="g-main"><b>' + t('vs.') + ' ' + esc(opp && opp.name || '?') + (opp && opp.rating ? ' (' + opp.rating + ')' : '') + '</b>' +
        '<small>' + [I.date(e.end), e.opening ? SK.book.display(e.opening) : '', colorName(me)].filter(Boolean).map(esc).join(' · ') + '</small></span>' +
        '<span class="g-acc">' + (acc == null ? '–' : num1(acc)) + '</span></button></li>';
    }).join('') + '</ul>';
  }
  function openLibraryGame(id) {
    var e = LIB.get(id);
    if (!e) return;
    importText(e.pgn, { user: e.userColor ? { name: e.userColor === 'w' ? e.white.name : e.black.name, color: e.userColor } : null,
                        game: e.site !== 'pgn' ? { site: e.site, id: e.id.split(':').slice(1).join(':'), url: e.url, end: e.end } : null, ply: 0 });
  }

  /* ---------- Pro, Test und Lizenz ---------- */

  var PRO_REASON = {
    insights: 'Insights über mehr als {n} Partien gibt es mit Pro.',
    trainer: 'Das Tageslimit von {n} Trainer-Aufgaben ist erreicht. Mit Pro trainierst du unbegrenzt.',
    auto: 'Der Auto-Import neuer Partien ist eine Pro-Funktion.',
    depth: 'Review-Tiefen über {n} gibt es mit Pro.',
    theme: 'Dieses Brett-Design gehört zu Pro.',
    share: 'Mit Pro teilst du ohne Wasserzeichen.',
    generic: 'Alle Werkzeuge, um schneller besser zu werden.'
  };
  function openPro(reason) {
    var f = CFG.free || {};
    var n = { insights: f.insightsGames, trainer: f.trainerPerDay, depth: f.reviewDepthMax }[reason];
    $('proReason').textContent = t(PRO_REASON[reason] || PRO_REASON.generic, { n: n });
    renderProDialog();
    $('proBox').hidden = false;
  }
  function renderProDialog() {
    var st = LIC.state(), p = (SK.seller && I.lang() === 'en' && SK.seller.pricesEn) || (SK.seller && SK.seller.prices) || CFG.prices || {};
    $('proPrices').innerHTML =
      '<div class="price"><b>' + esc(p.monthly || '') + '</b><span>' + t('pro Monat') + '</span></div>' +
      '<div class="price best"><b>' + esc(p.yearly || '') + '</b><span>' + t('pro Jahr') + '</span><i>' + t('beliebt') + '</i></div>' +
      '<div class="price"><b>' + esc(p.lifetime || '') + '</b><span>' + t('einmalig, für immer') + '</span></div>';
    $('proTrial').hidden = st.plan !== 'free' || st.trialUsed;
    $('proBuy').hidden = st.plan === 'pro';
    $('proDeactivate').hidden = st.plan !== 'pro';
    var txt = '';
    if (st.plan === 'pro') txt = t('Pro ist aktiv{e}. Schlüssel {k}.', { e: st.email ? ' (' + st.email + ')' : '', k: st.key }) + (st.offline ? ' ' + t('Zuletzt offline geprüft.') : '');
    else if (st.plan === 'trial') txt = t('Dein Test läuft bis {d}.', { d: I.date(st.until, true) });
    else if (st.problem) txt = st.problem;
    else if (st.trialUsed) txt = t('Dein Test ist abgelaufen.');
    $('proStatus').textContent = txt;
  }
  function renderPlan() {
    var st = LIC.state(), b = $('planBtn');
    b.dataset.plan = st.plan;
    if (st.plan === 'pro') b.textContent = 'PRO';
    else if (st.plan === 'trial') b.textContent = t('Pro-Test · {n} T.', { n: Math.max(1, Math.ceil((st.until - Date.now()) / 86400000)) });
    else b.textContent = t('Pro holen');
  }
  function licenseErrorText(e) {
    switch (e && e.code) {
      case 'input': return t('Bitte den vollständigen Lizenzschlüssel eingeben.');
      case 'wrong_product': return t('Dieser Schlüssel gehört zu einem anderen Produkt.');
      case 'inactive': return t('Dieser Schlüssel ist nicht aktiv.');
      case 'network': return t('Lizenzserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
      default: return (e && e.message) || t('Der Schlüssel wurde nicht angenommen.');
    }
  }

  /* ---------- Teilen ---------- */

  function shareMove() {
    var last = state.ply > 0 ? state.line[state.ply - 1] : null;
    var cls = last ? classifyAll()[state.ply - 1] : null;
    if (!last || !cls) return;
    var names = gameNames();
    var title = cls.key === 'brilliant' ? t('Brillanter Zug!!') : cls.key === 'great' ? t('Großartiger Zug!') : catLabel(cls.key);
    SK.share.moveCard({
      fen: last.fenAfter, orientation: state.orientation, lastMove: { from: last.from, to: last.to },
      badge: { key: cls.key, sym: C.CATS[cls.key].sym }, title: title,
      subtitle: moveLabel(last) + '  ·  ' + names.w + ' – ' + names.b,
      footer: t('Analysiert mit {b} · {u}', { b: CFG.brand, u: (CFG.siteUrl || '').replace(/^https?:\/\//, '') }),
      brand: CFG.brand, tagline: 'Stockfish 18', watermark: LIC.limits().shareWatermark
    }).then(function (blob) { return SK.share.deliver(blob, 'zugradar-' + cls.key + '.png', title + ' ' + moveLabel(last)); });
  }
  function shareReview() {
    var results = classifyAll(), names = gameNames();
    var sum = summaryFor(results);
    var rows = ['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'blunder'].map(function (k) {
      return { key: k, sym: C.CATS[k].sym, label: catLabel(k), w: sum.w.counts[k], b: sum.b.counts[k] };
    });
    SK.share.reviewCard({
      title: t('Partie-Review'), subtitle: (SK.book.display(SK.book.nameFor(fensUpTo(state.line.length))) || '') + (state.headers.Result && state.headers.Result !== '*' ? '  ·  ' + state.headers.Result : ''),
      white: names.w, black: names.b, accW: accuracyFor('w', results), accB: accuracyFor('b', results), rows: rows,
      footer: t('Analysiert mit {b} · {u}', { b: CFG.brand, u: (CFG.siteUrl || '').replace(/^https?:\/\//, '') }),
      brand: CFG.brand, tagline: 'Stockfish 18', watermark: LIC.limits().shareWatermark
    }).then(function (blob) { return SK.share.deliver(blob, 'zugradar-review.png', t('Partie-Review')); });
  }

  /* ---------- Töne ---------- */

  var audio = null;
  function sound(kind) {
    if (!state.settings.sound) return;
    try {
      if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audio = new AC(); }
      if (audio.state === 'suspended') return; // erst nach einer Nutzeraktion
      var now = audio.currentTime;
      var tones = { move: [[520, 0, 0.05]], capture: [[300, 0, 0.07], [220, 0.03, 0.07]], check: [[660, 0, 0.06], [880, 0.07, 0.07]],
                    brilliant: [[660, 0, 0.09], [880, 0.08, 0.09], [1320, 0.16, 0.14]] }[kind] || [];
      tones.forEach(function (tn) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === 'brilliant' ? 'sine' : 'triangle';
        o.frequency.value = tn[0];
        g.gain.setValueAtTime(0.0001, now + tn[1]);
        g.gain.exponentialRampToValueAtTime(0.14, now + tn[1] + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + tn[1] + tn[2]);
        o.connect(g); g.connect(audio.destination);
        o.start(now + tn[1]); o.stop(now + tn[1] + tn[2] + 0.02);
      });
    } catch (e) { /* kein Ton – egal */ }
  }
  function unlockAudio() {
    try {
      if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (e) { /* egal */ }
  }

  /* ---------- Brett-Designs ---------- */

  function applyTheme() {
    var th = state.settings.theme;
    if ((LIC.limits().themes || ['club']).indexOf(th) < 0) th = 'club';
    if (th === 'club') delete document.documentElement.dataset.board;
    else document.documentElement.dataset.board = th;
  }
  function themeOptions() {
    var allowed = LIC.limits().themes || ['club'];
    $('selTheme').innerHTML = THEMES.map(function (th) {
      return '<option value="' + th.id + '">' + esc(t(th.label)) + (allowed.indexOf(th.id) < 0 ? ' · PRO' : '') + '</option>';
    }).join('');
    $('selTheme').value = allowed.indexOf(state.settings.theme) >= 0 ? state.settings.theme : 'club';
  }

  /* ---------- Rahmen: Tabs, Status, Knöpfe ---------- */

  function renderChrome() {
    var m = state.mode;
    ['Analyse', 'Play', 'Insights', 'Trainer'].forEach(function (k) {
      $('mode' + k).setAttribute('aria-selected', String(m === k.toLowerCase() || (k === 'Analyse' && m === 'analyse')));
    });
    $('mainView').hidden = m === 'insights';
    $('insightsView').hidden = m !== 'insights';
    $('playBox').hidden = m !== 'play';
    $('welcomeCard').hidden = !(m === 'analyse' && state.sample && !state.settings.welcomed && !train);
    var pf = $('btnPlayFrom');
    pf.hidden = !(m === 'play' && stash && !state.line.length && stash.ply > 0);
    if (!pf.hidden) pf.textContent = t('Geladene Partie ab Zug {n} weiterspielen', { n: Math.floor(stash.ply / 2) + 1 });
    $('engineCard').hidden = m === 'trainer' && !!train;
    $('sheetCard').hidden = m === 'trainer';
    $('btnImport').hidden = false;
    renderPlan();
  }

  function renderStatus() {
    var pill = $('enginePill'), tx = $('engineText');
    var st = engine.state, info = engine.info;
    if (st === 'ready') {
      var job = an.job;
      var busy = job && !job.finished;
      pill.dataset.state = busy ? 'busy' : 'ready';
      var what = !busy ? t('bereit') : job.kind === 'play' ? t('KI zieht') : batch.cur && job.key && batch.cur.fens.some(function (f) { return E.posKey(f) === job.key; }) ? t('Serie') : job.kind === 'review' ? t('Review') : t('live');
      tx.textContent = info.name + (window.innerWidth < 520 ? '' : ' · ' + t(info.note)) + ' · ' + what;
      pill.title = info.name + ' (' + t(info.note) + ')';
    } else if (st === 'failed') {
      pill.dataset.state = 'failed';
      tx.textContent = t('Engine nicht geladen – tippen für neuen Versuch');
      pill.title = engine.log.join('\n');
    } else {
      pill.dataset.state = 'loading';
      tx.textContent = t('Lade {x} …', { x: engineDetail || 'Stockfish' });
    }
  }

  function renderControls(pi, entry, engineOn) {
    $('btnFirst').disabled = $('btnPrev').disabled = state.ply === 0 || !!train;
    $('btnNext').disabled = $('btnLast').disabled = state.ply >= state.line.length || !!train;
    var canBest = !pi.terminal && entry && entry.lines.length && engineOn &&
      (state.mode === 'analyse' || (state.ply === state.line.length && pi.turn === state.settings.humanColor));
    $('btnBest').disabled = !canBest || !!train;
    $('varBanner').hidden = !state.main || state.mode === 'trainer';
    $('btnTakeback').disabled = !state.line.length || ai.thinking;
    $('btnShareReview').hidden = !state.line.length;
  }

  /* ---------- Export ---------- */

  function exportPgn() {
    var results = classifyAll();
    var h = Object.assign({ Event: 'Zugradar', Site: '?', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: '?', Black: '?', Result: '*' }, state.headers);
    var pi = posInfo(fenAt(state.line.length));
    if (pi.terminal) h.Result = pi.terminal === 'mate' ? (pi.turn === 'w' ? '0-1' : '1-0') : '1/2-1/2';
    if (state.startFen !== START) { h.SetUp = '1'; h.FEN = state.startFen; }
    var order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    var keys = order.filter(function (k) { return h[k] != null; }).concat(Object.keys(h).filter(function (k) { return order.indexOf(k) < 0; }));
    var out = keys.map(function (k) { return '[' + k + ' "' + String(h[k]).replace(/"/g, "'") + '"]'; }).join('\n') + '\n\n';
    var toks = [];
    state.line.forEach(function (m, i) {
      var numv = posInfo(m.fenBefore).fullmove;
      var r = results[i];
      var tk = (m.color === 'w' ? numv + '. ' : (i === 0 ? numv + '... ' : '')) +
              m.san + (r && C.CATS[r.key].nag ? C.CATS[r.key].nag : '');
      var e = an.entry(m.fenAfter);
      var com = [];
      if (e && e.lines[0]) {
        var ws = whiteScore(m.fenAfter, e.lines[0].score);
        com.push('[%eval ' + (ws.mate != null ? '#' + ws.mate : (ws.cp / 100).toFixed(2)) + ']');
      }
      if (m.clock != null) com.push('[%clk ' + CO.fmtClock(m.clock).replace(/\.\d$/, '') + ']');
      if (r) com.push(catLabel(r.key));
      if (com.length) tk += ' {' + com.join(' ') + '}';
      toks.push(tk);
    });
    toks.push(h.Result);
    var line = '', lines = [];
    toks.forEach(function (tk) { if ((line + ' ' + tk).length > 80) { lines.push(line); line = tk; } else line = line ? line + ' ' + tk : tk; });
    if (line) lines.push(line);
    return out + lines.join('\n') + '\n';
  }

  /* ---------- Ereignisse ---------- */

  function bind() {
    board = new SK.Board($('board'), {
      canPick: function (color) {
        var pi = posInfo(viewFen());
        if (color !== pi.turn) return false;
        if (train) return train.status === 'try';
        if (state.mode === 'play') return color === state.settings.humanColor && state.ply === state.line.length && !ai.thinking;
        return true;
      },
      legalFrom: function (sq) {
        return posInfo(viewFen()).moves.filter(function (m) { return m.from === sq; })
          .map(function (m) { return { to: m.to, promotion: m.promotion, captured: m.captured }; });
      },
      onMove: function (m) { if (train) trainMove(m); else userMove(m); }
    });
    document.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });

    $('btnFirst').onclick = function () { go(0); };
    $('btnPrev').onclick = function () { go(state.ply - 1); };
    $('btnNext').onclick = function () { go(state.ply + 1, true); };
    $('btnLast').onclick = function () { go(state.line.length); };
    $('btnFlip').onclick = function () { state.orientation = state.orientation === 'w' ? 'b' : 'w'; save(); render(); };
    $('btnBest').onclick = playBest;
    $('btnNew').onclick = function () { state.sample = false; newGame(); };
    $('btnMain').onclick = function () {
      if (!state.main) return;
      state.line = state.main.line; state.ply = state.main.ply; state.main = null;
      changed();
    };
    $('lines').addEventListener('click', function (e) {
      if (e.target.id === 'btnRetryEngine') { retryEngine(); return; }
      var li = e.target.closest('li[data-uci]');
      if (!li || train) return;
      var pi = posInfo(fenAt(state.ply));
      if (state.mode === 'play' && (pi.turn !== state.settings.humanColor || state.ply !== state.line.length)) return;
      userMove(uciToMove(li.dataset.uci));
    });
    $('moves').addEventListener('click', function (e) {
      var c = e.target.closest('.mv[data-ply]');
      if (c && !train) go(+c.dataset.ply);
    });
    $('moments').addEventListener('click', function (e) {
      var c = e.target.closest('.km[data-ply]');
      if (c && !train) go(+c.dataset.ply);
    });

    // Fehler-Training und Trainer
    $('btnTrain').onclick = startTraining;
    $('btnTrainerStart').onclick = startTrainer;
    $('btnTrainerInsights').onclick = function () { setMode('insights'); };
    $('verdict').addEventListener('click', function (e) {
      var sh = e.target.closest('[data-share]');
      if (sh) { shareMove(); return; }
      var b = e.target.closest('[data-act]');
      if (!b || !train) return;
      var a = b.dataset.act;
      if (a === 'next') trainNext();
      else if (a === 'show') trainReveal();
      else if (a === 'hint') { train.hint = true; render(); }
      else if (a === 'stop') stopTraining();
      else if (a === 'pro') openPro('trainer');
      else if (a === 'again') { var src = train.source; stopTraining(true); if (src === 'srs') startTrainer(); else startTraining(); }
    });
    $('btnShareReview').onclick = shareReview;

    // Bereiche
    $('modeAnalyse').onclick = function () { if (state.mode !== 'analyse') setMode('analyse'); };
    $('modePlay').onclick = function () { if (state.mode !== 'play') setMode('play'); };
    $('modeInsights').onclick = function () { if (state.mode !== 'insights') setMode('insights'); };
    $('modeTrainer').onclick = function () { if (state.mode !== 'trainer') setMode('trainer'); };
    $('btnPlayNew').onclick = function () { state.mode = 'play'; newGame(); };
    $('btnPlayFrom').onclick = playFromStash;
    $('helpBtn').onclick = openHelp;
    $('helpClose').onclick = closeHelp;
    $('helpBox').addEventListener('click', function (e) { if (e.target === $('helpBox')) closeHelp(); });
    $('welcomeClose').onclick = dismissWelcome;
    $('welcomeImport').onclick = function () { dismissWelcome(); openImport('games'); };
    $('welcomePlay').onclick = function () { dismissWelcome(); setMode('play'); };
    $('welcomeHelp').onclick = openHelp;
    $('btnBackup').onclick = backupData;
    $('btnRestore').onclick = function () { $('restoreFile').value = ''; $('restoreFile').click(); };
    $('restoreFile').onchange = function () { restoreData(this.files && this.files[0]); };
    window.addEventListener('hashchange', handleHash);
    $('btnTakeback').onclick = function () {
      if (!state.line.length) return;
      cancelAI();
      var n = state.line.length;
      var back = state.line[n - 1].color === state.settings.humanColor ? 1 : 2;
      state.line = state.line.slice(0, Math.max(0, n - back));
      state.ply = state.line.length;
      changed();
    };

    // Insights
    $('insRun').onclick = batchStart;
    $('insCancel').onclick = batchCancel;
    $('insBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ins]');
      if (b) {
        var a = b.dataset.ins;
        if (a === 'user') openImport('games');
        else if (a === 'pro') openPro('insights');
        else if (a === 'trainer') setMode('trainer');
        return;
      }
      var g = e.target.closest('[data-lib]');
      if (g) { openLibraryGame(g.dataset.lib); return; }
      var bar = e.target.closest('[data-game]');
      if (bar) openLibraryGame(bar.dataset.game);
    });

    // Einstellungen
    function bindSel(id, key, numv, check) {
      var el = $(id);
      el.value = String(state.settings[key]);
      el.onchange = function () {
        var v = numv ? +el.value : el.value;
        if (check && !check(v)) { el.value = String(state.settings[key]); return; }
        state.settings[key] = v;
        if (key === 'humanColor' && state.mode === 'play') state.orientation = el.value;
        if (key === 'theme') applyTheme();
        applyEngineCfg(); movesSig = ''; reviewSig = ''; graphSig = ''; coachMemo.clear(); changed();
      };
    }
    function bindChk(id, key) {
      var el = $(id);
      el.checked = !!state.settings[key];
      el.onchange = function () { state.settings[key] = el.checked; applyEngineCfg(); changed(); };
    }
    var selLevel = $('selLevel');
    selLevel.innerHTML = LEVELS.map(function (l) { return '<option value="' + l.id + '">' + esc(t(l.label)) + '</option>'; }).join('');
    themeOptions();
    bindSel('selColor', 'humanColor');
    bindSel('selLevel', 'level');
    bindSel('selLive', 'liveMax', true);
    bindSel('selReview', 'reviewDepth', true, function (v) {
      if (v > (LIC.limits().reviewDepthMax || 16)) { openPro('depth'); return false; }
      return true;
    });
    bindSel('selNotation', 'notation');
    bindSel('selLines', 'lines', true);
    bindSel('selTheme', 'theme', false, function (v) {
      if ((LIC.limits().themes || []).indexOf(v) < 0) { openPro('theme'); return false; }
      return true;
    });
    bindChk('chkHints', 'hints');
    bindChk('chkSound', 'sound');
    bindChk('chkArrowBest', 'arrowBest');
    bindChk('chkArrowAlt', 'arrowAlt');
    bindChk('chkArrowBetter', 'arrowBetter');
    bindChk('chkBadges', 'badges');
    bindChk('chkAuto', 'autoReview');

    // Import-Dialog: Tabs „Meine Partien“ / „PGN / FEN“
    $('btnImport').onclick = function () { openImport('games'); };
    $('autoChip').onclick = function () { openImport('games'); };
    $('tabGames').onclick = function () { setImportTab('games'); };
    $('tabPgn').onclick = function () { setImportTab('pgn'); };
    $('connSite').value = state.settings.connSite;
    $('connUser').value = state.settings.connUser;
    $('connAuto').checked = !!state.settings.connAuto && !!LIC.limits().autoImport;
    $('connLoad').onclick = connLoadList;
    $('connUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') connLoadList(); });
    $('connSite').onchange = function () { state.settings.connSite = $('connSite').value; state.settings.connLast = 0; save(); };
    $('connAuto').onchange = function () {
      var s = state.settings;
      if ($('connAuto').checked && !LIC.limits().autoImport) { $('connAuto').checked = false; openPro('auto'); return; }
      s.connAuto = $('connAuto').checked;
      s.connUser = $('connUser').value.trim() || s.connUser;
      save(); connSchedule();
      if (s.connAuto && !s.connUser) connStatus(t('Für den Auto-Import erst den Benutzernamen eingeben.'), 'error');
      else if (s.connAuto) { connStatus(t('Auto-Import aktiv: Zugradar prüft jede Minute auf neue, beendete Partien.'), 'ok'); if (!conn.games.length) connLoadList(); }
    };
    $('connGames').addEventListener('click', function (e) {
      var b = e.target.closest('.game[data-i]');
      if (b) loadGame(conn.games[+b.dataset.i]);
    });
    $('btnImportCancel').onclick = closeImport;
    $('importBox').addEventListener('click', function (e) { if (e.target === $('importBox')) closeImport(); });
    $('btnImportGo').onclick = function () {
      var err = importText($('importText').value);
      if (err) { $('importError').textContent = err; $('importError').hidden = false; return; }
      $('importText').value = ''; closeImport();
    };
    $('btnSample').onclick = function () { closeImport(); loadSample(); };
    document.addEventListener('paste', function (e) {
      var tg = e.target;
      if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT')) return;
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!txt || txt.length < 8) return;
      var err = importText(txt);
      if (err) { $('importText').value = txt; openImport('pgn'); $('importError').textContent = err; $('importError').hidden = false; }
    });

    $('btnCopyPgn').onclick = function () {
      var pgn = exportPgn(), note = $('copyNote');
      function fallback() {
        $('importText').value = pgn; openImport('pgn');
        $('importText').select();
        $('importError').textContent = t('Kopieren wurde blockiert – die PGN ist markiert, kopiere sie mit Strg+C.');
        $('importError').hidden = false;
      }
      try {
        navigator.clipboard.writeText(pgn).then(function () {
          note.textContent = t('PGN kopiert (mit Bewertungen).'); note.hidden = false;
          setTimeout(function () { note.hidden = true; }, 2500);
        }, fallback);
      } catch (e) { fallback(); }
    };

    // Pro
    $('planBtn').onclick = function () { openPro('generic'); };
    $('proClose').onclick = function () { $('proBox').hidden = true; };
    $('proBox').addEventListener('click', function (e) { if (e.target === $('proBox')) $('proBox').hidden = true; });
    $('proBuy').onclick = function () {
      if (!CFG.checkoutUrl) { $('proStatus').textContent = t('Der Shop ist noch nicht verbunden (checkoutUrl in src/config.js).'); return; }
      var a = document.createElement('a');
      a.href = CFG.checkoutUrl; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      $('proKeyBox').open = true;
      $('proStatus').textContent = t('Nach dem Kauf bekommst du einen Lizenzschlüssel per E-Mail. Trag ihn unten ein.');
    };
    $('proTrial').onclick = function () {
      if (LIC.startTrial()) { renderProDialog(); $('proStatus').textContent = t('Test gestartet – viel Spaß mit Pro!'); }
    };
    $('proActivate').onclick = function () {
      var st = $('proKeyStatus');
      st.textContent = t('Prüfe Schlüssel …'); st.dataset.kind = 'busy';
      LIC.activate($('proKey').value).then(function () {
        st.textContent = t('Pro ist freigeschaltet. Danke für deine Unterstützung!'); st.dataset.kind = 'ok';
        $('proKey').value = '';
        renderProDialog();
      }, function (e) { st.textContent = licenseErrorText(e); st.dataset.kind = 'error'; });
    };
    $('proDeactivate').onclick = function () { LIC.deactivate().then(function () { renderProDialog(); }); };
    LIC.onChange(function () { applyEngineCfg(); applyTheme(); themeOptions(); connSchedule(); insightsDirty = true; render(); });

    // Sprache
    $('langBtn').onclick = function () {
      I.setLang(I.lang() === 'de' ? 'en' : 'de');
      applyLanguage();
    };

    $('enginePill').onclick = function () { if (engine.state === 'failed') retryEngine(); };

    // Graph: Hover + Klick
    var g = $('graph');
    function plyAt(e) {
      var b = g.getBoundingClientRect(), n = state.line.length;
      return Math.max(0, Math.min(n, Math.round((e.clientX - b.left) / b.width * n)));
    }
    g.addEventListener('pointermove', function (e) { graphHover = plyAt(e); renderGraph(classifyAll()); });
    g.addEventListener('pointerleave', function () { graphHover = null; renderGraph(classifyAll()); });
    g.addEventListener('click', function (e) { if (!train) go(plyAt(e)); });
    window.addEventListener('resize', function () { insightsDirty = true; soon(); });

    document.addEventListener('keydown', function (e) {
      // Escape schließt Dialoge auch, wenn gerade ein Eingabefeld den Fokus hat
      if (e.key === 'Escape' && !$('importBox').hidden) { closeImport(); return; }
      if (e.key === 'Escape' && !$('proBox').hidden) { $('proBox').hidden = true; return; }
      if (e.key === 'Escape' && !$('helpBox').hidden) { closeHelp(); return; }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!$('importBox').hidden || !$('proBox').hidden || !$('helpBox').hidden) return;
      if (e.key === '?') { openHelp(); return; }
      if (train) { if (e.key === 'Escape') stopTraining(); return; }
      if (state.mode === 'insights') return;
      if (e.key === 'ArrowLeft') { go(state.ply - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(state.ply + 1, true); e.preventDefault(); }
      else if (e.key === 'Home') { go(0); e.preventDefault(); }
      else if (e.key === 'End') { go(state.line.length); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') { $('btnFlip').click(); }
      else if (e.key === ' ' && !$('btnBest').disabled && e.target === document.body) { playBest(); e.preventDefault(); }
    });
  }

  function applyLanguage() {
    I.apply();
    $('langBtn').textContent = I.lang() === 'de' ? 'EN' : 'DE';
    var selLevel = $('selLevel'), lv = selLevel.value;
    selLevel.innerHTML = LEVELS.map(function (l) { return '<option value="' + l.id + '">' + esc(t(l.label)) + '</option>'; }).join('');
    selLevel.value = lv;
    themeOptions();
    movesSig = ''; reviewSig = ''; graphSig = ''; coachMemo.clear(); insightsDirty = true;
    if (conn.games.length) renderGames();
    render();
  }

  /* ---------- Hilfe, Willkommen, Datensicherung, Direktlinks ---------- */

  var HELP_CATS = {
    brilliant: 'Ein gutes Opfer: der beste oder fast beste Zug, bei dem du Material hergibst.',
    great: 'Der einzige gute Zug in einer kritischen Stellung.',
    best: 'Der Zug, den Stockfish selbst spielt.',
    excellent: 'Fast so gut wie der beste Zug.',
    good: 'Solider Zug mit kleinem Verlust.',
    book: 'Bekannte Eröffnungstheorie.',
    forced: 'Der einzige legale Zug.',
    inaccuracy: 'Kleiner Verlust an Gewinnchance.',
    mistake: 'Deutlicher Verlust an Gewinnchance.',
    miss: 'Ein Matt oder ein Fehler des Gegners wurde nicht genutzt.',
    blunder: 'Schwerer Fehler, der oft die Partie kostet.'
  };
  function openHelp() {
    $('helpLegend').innerHTML = C.ORDER.map(function (k) {
      return '<div class="hl"><span class="sym c-' + k + '">' + C.CATS[k].sym + '</span><b>' + esc(catLabel(k)) + '</b><span>' + esc(t(HELP_CATS[k])) + '</span></div>';
    }).join('');
    var keys = [['← →', t('Zug zurück / vor')], [t('Pos1') + ' / ' + t('Ende'), t('Zum Anfang / zum Ende')], ['F', t('Brett drehen')],
                [t('Leertaste'), t('Besten Zug spielen')], ['Esc', t('Dialog oder Training beenden')]];
    $('helpKeys').innerHTML = keys.map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('');
    var mail = (CFG.support && CFG.support.email) || '';
    $('helpSupport').innerHTML = mail
      ? esc(t('Fragen, Probleme oder Wünsche? Schreib an')) + ' <a href="mailto:' + esc(mail) + '?subject=' + encodeURIComponent('Zugradar ' + ((SK.build && SK.build.version) || '')) + '">' + esc(mail) + '</a>.'
      : esc(t('Kontakt: siehe')) + ' <a href="impressum.html" target="_blank" rel="noopener">' + esc(t('Impressum')) + '</a>.';
    $('helpVersion').textContent = 'Zugradar ' + ((SK.build && SK.build.version) || '') + ' · ' + (engine.info ? engine.info.name : 'Stockfish');
    $('helpBox').hidden = false;
    $('helpClose').focus({ preventScroll: true });
    document.querySelector('.help-dialog').scrollTop = 0;
  }
  function closeHelp() { $('helpBox').hidden = true; }
  function dismissWelcome() {
    if (state.settings.welcomed) return;
    state.settings.welcomed = true; save(); render();
  }

  var BACKUP_KEYS = ['zugradar.v1', 'zugradar.library.v1', 'zugradar.srs.v1'];
  function dataStatus(txt, bad) { var el = $('dataStatus'); el.textContent = txt || ''; el.classList.toggle('bad', !!bad); }
  function backupData() {
    save();
    var data = {};
    BACKUP_KEYS.forEach(function (k) {
      try { var v = localStorage.getItem(k); if (v != null) data[k] = JSON.parse(v); } catch (e) { /* egal */ }
    });
    if (!Object.keys(data).length) { dataStatus(t('Dein Browser speichert keine Daten (privater Modus?). Es gibt nichts zu sichern.'), true); return; }
    var out = { app: 'zugradar', kind: 'backup', v: 1, created: new Date().toISOString(), data: data };
    var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    var name = (I.lang() === 'en' ? 'zugradar-backup-' : 'zugradar-sicherung-') + new Date().toISOString().slice(0, 10) + '.json';
    var games = (data['zugradar.library.v1'] || []).length, puzzles = (data['zugradar.srs.v1'] || []).length;
    SK.share.saveFile(blob, name).then(function (r) {
      if (r === 'cancelled') { dataStatus(''); return; }
      dataStatus(t('Gesichert: {g}, {p}.', {
        g: games === 1 ? t('1 Partie') : t('{n} Partien', { n: games }),
        p: puzzles === 1 ? t('1 Trainer-Aufgabe') : t('{n} Trainer-Aufgaben', { n: puzzles }) }));
    }, function () { dataStatus(t('Die Sicherung konnte nicht gespeichert werden.'), true); });
  }
  function restoreData(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var j = null;
      try { j = JSON.parse(rd.result); } catch (e) { j = null; }
      if (!j || j.app !== 'zugradar' || j.kind !== 'backup' || !j.data || typeof j.data !== 'object') {
        dataStatus(t('Das ist keine Zugradar-Sicherung.'), true); return;
      }
      var when = j.created ? I.date(Date.parse(j.created), true) : '?';
      if (!window.confirm(t('Die Sicherung vom {d} ersetzt deine jetzigen Partien, Trainer-Fortschritte und Einstellungen. Fortfahren?', { d: when }))) return;
      try {
        BACKUP_KEYS.forEach(function (k) { if (j.data[k] !== undefined) localStorage.setItem(k, JSON.stringify(j.data[k])); });
      } catch (e) { dataStatus(t('Wiederherstellen fehlgeschlagen: Der Speicher des Browsers ist voll oder gesperrt.'), true); return; }
      location.reload();
    };
    rd.onerror = function () { dataStatus(t('Die Datei konnte nicht gelesen werden.'), true); };
    rd.readAsText(file);
  }

  // Direktlinks: zugradar.html#lizenz (nach dem Kauf), #pro, #hilfe, #spielen, #laden
  function handleHash() {
    var h = decodeURIComponent((location.hash || '').slice(1)), key = '';
    if (!h) return;
    var m = h.match(/^(lizenz|license|key)(?:=(.+))?$/i);
    if (m) key = m[2] || '';
    var act = m ? 'key' : h.toLowerCase();
    if (act === 'key') {
      openPro('generic');
      $('proKeyBox').open = true;
      if (key) $('proKey').value = key.trim();
      setTimeout(function () { $('proKey').focus(); }, 50);
    } else if (act === 'pro') openPro('generic');
    else if (act === 'hilfe' || act === 'help') openHelp();
    else if (act === 'spielen' || act === 'play') setMode('play');
    else if (act === 'laden' || act === 'import') openImport('games');
    else return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* egal */ }
  }

  function openImport(tab) {
    $('importError').hidden = true; $('importBox').hidden = false;
    setImportTab(tab || 'games');
  }
  function closeImport() { $('importBox').hidden = true; }
  function setImportTab(tab) {
    $('tabGames').setAttribute('aria-selected', String(tab === 'games'));
    $('tabPgn').setAttribute('aria-selected', String(tab === 'pgn'));
    $('paneGames').hidden = tab !== 'games';
    $('panePgn').hidden = tab !== 'pgn';
    (tab === 'pgn' ? $('importText') : $('connUser')).focus();
  }

  function retryEngine() { engine.log = []; engineT0 = Date.now(); engine.start(); render(); }

  function playBest() {
    if (train) return;
    var fen = fenAt(state.ply), e = an.entry(fen);
    if (!e || !e.lines.length) return;
    userMove(uciToMove(e.lines[0].uci));
  }

  /* ---------- Start ---------- */

  function registerServiceWorker() {
    // Nur auf der eigenen Website (https oder localhost), nicht in eingebetteten Vorschauen
    try {
      if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href) || window.top !== window.self) return;
      navigator.serviceWorker.register('sw.js').catch(function () { /* egal */ });
      // Sobald die Engine läuft: Engine-Dateien für offline ablegen lassen
      var warm = function () {
        navigator.serviceWorker.ready.then(function (reg) { if (reg.active) reg.active.postMessage({ type: 'warm-engine' }); });
      };
      warmEngineCache = warm;
      if (engine.state === 'ready') warm();
    } catch (e) { /* egal */ }
  }

  function init() {
    SK.book.build(L);
    var had = restore();
    if (!had && /^de/i.test(navigator.language || '') === false) state.settings.notation = 'en';
    bind();
    if (!had) {
      state.sample = true;
      var sans = SAMPLE.moves.split(' '), fen = START, line = [];
      for (var i = 0; i < sans.length; i++) { var mv = makeMove(fen, sans[i]); if (!mv) break; line.push(mv); fen = mv.fenAfter; }
      state.line = line; state.ply = SAMPLE.ply; state.headers = SAMPLE.headers;
    }
    applyTheme();
    I.apply();
    $('langBtn').textContent = I.lang() === 'de' ? 'EN' : 'DE';
    render();
    engine.start();
    connSchedule();
    LIC.revalidate().then(function () { renderPlan(); }, function () {});
    registerServiceWorker();
    handleHash();
    var tick = setInterval(function () { if (engine.state === 'ready' || engine.state === 'failed') clearInterval(tick); render(); }, 1000);
    // Test-Hook (Selbsttests im Browser)
    window.__zugradar = { state: state, an: an, engine: engine, classifyAll: classifyAll, userMove: userMove, go: go,
                          importText: importText, exportPgn: exportPgn, setMode: setMode, newGame: newGame, render: render,
                          startTraining: startTraining, startTrainer: startTrainer, trainMove: trainMove, train: function () { return train; },
                          connPoll: connPoll, coachFor: coachFor, batch: function () { return batch; }, batchStart: batchStart,
                          openPro: openPro, applyLanguage: applyLanguage, openHelp: openHelp, handleHash: handleHash };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
