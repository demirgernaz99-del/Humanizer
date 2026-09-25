/* Zugradar – App: Zustand, Live-Analyse, Zugbewertung, Spiel gegen die KI, Review. */
(function () {
  'use strict';
  var SK = window.SK, L = SK.ChessLib, C = SK.classify, E = SK.engine;
  var START = L.DEFAULT_POSITION;
  var STORE = 'zugradar.v1';
  var MIN_D = 12;        // Mindesttiefe, ab der ein Zug bewertet wird
  var MIN_D_AFTER = 10;  // Mindesttiefe der Folgestellung
  var ANNOUNCE_D = 14;   // ab dieser Tiefe gibt es das „Brillant!!“-Banner

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

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
  var DEFAULTS = {
    liveMax: 22, reviewDepth: 16, lines: 3, notation: 'de',
    arrowBest: true, arrowAlt: false, arrowBetter: true, badges: true, autoReview: true,
    hints: true, humanColor: 'w', level: 'club',
    connSite: 'chesscom', connUser: '', connAuto: false, connLast: 0
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
    game: null    // { site, id, url } – Herkunft der geladenen Partie
  };
  var train = null; // Fehler-Training, siehe unten
  var CO = SK.coach;

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
          mated: terminal === 'mate', fullmove: +fen.split(' ')[5] || 1 };
    if (posMemo.size > 4000) posMemo.clear();
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
  function pvText(fen, pv, max) {
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

  /* ---------- Engine ---------- */

  var engine = new E.Engine();
  var an = new E.Analyzer(engine, {});
  function applyEngineCfg() {
    var s = state.settings;
    an.configure({ liveMax: +s.liveMax, liveMin: Math.min(16, +s.liveMax), reviewDepth: +s.reviewDepth,
                   liveMpv: +s.lines < 2 ? 2 : +s.lines, reviewMpv: 2 });
  }

  var renderQueued = false;
  function soon() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function () { renderQueued = false; render(); }, 90);
  }
  an.onUpdate = function () { soon(); };
  an.onActivity = function () { soon(); };
  engine.onStatus = function (st, detail) {
    if (st === 'ready') { applyEngineCfg(); updateEngine(); }
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
    an.setQueue(items.map(function (k) { var f = fenAt(k); return { fen: f, legal: posInfo(f).legal }; })
      .filter(function (x) { return x.legal > 0 && !posInfo(x.fen).terminal; }));
    maybeAI();
  }

  /* ---------- Bewertung aller Züge ---------- */

  var clsMemo = new Map();
  var bookStart = function () { return E.posKey(state.startFen) === E.posKey(START); };
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
    if (state.mode !== 'play' || state.ply !== state.line.length || engine.state !== 'ready') { cancelAI(); return; }
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
          animateNext = { from: mv.from, to: mv.to };
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
    animateNext = { from: mv.from, to: mv.to };
    changed();
    return true;
  }

  function go(ply, animate) {
    ply = Math.max(0, Math.min(state.line.length, ply));
    if (ply === state.ply) return;
    if (animate && ply === state.ply + 1) animateNext = { from: state.line[state.ply].from, to: state.line[state.ply].to };
    state.ply = ply;
    changed();
  }

  function newGame() {
    cancelAI();
    state.startFen = START; state.line = []; state.main = null; state.ply = 0;
    state.headers = {}; state.sample = false; state.user = null; state.game = null;
    stopTraining(true);
    if (state.mode === 'play') state.orientation = state.settings.humanColor;
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
    state.user = opts.user || null;
    state.game = opts.game || null;
    if (opts.clocks) attachClocks(line, opts.clocks, state.headers.TimeControl);
    if (state.user && state.user.color) state.orientation = state.user.color;
    if (state.mode === 'play') setMode('analyse', true);
    changed();
  }

  // Restzeit nach jedem Zug (aus [%clk …]) und daraus die verbrauchte Bedenkzeit
  function attachClocks(line, clocks, tcHeader) {
    if (!clocks || !clocks.some(function (c) { return c != null; })) return;
    var spent = CO.timeSpent(clocks, line.map(function (m) { return m.color; }), CO.parseTimeControl(tcHeader));
    line.forEach(function (m, i) { m.clock = clocks[i] != null ? clocks[i] : null; m.spent = spent[i]; });
  }

  // PGN oder FEN laden → Fehlertext oder null
  function importText(txt, meta) {
    txt = (txt || '').trim();
    if (!txt) return 'Bitte eine PGN oder FEN einfügen.';
    var fenLike = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\b/.test(txt);
    if (fenLike) {
      var v = L.validateFen(txt);
      if (!v.ok) return 'Ungültige FEN: ' + v.error;
      state.sample = false;
      loadLine(new L.Chess(txt).fen(), [], {}, 0);
      return null;
    }
    // Deutsche Figurenbuchstaben in einfachen Zuglisten erlauben
    var pgn = txt;
    if (!/\[\w+\s+"/.test(pgn) && /\b[SLTD][a-h1-8x]/.test(pgn)) {
      pgn = pgn.replace(/\b([SLTDK])(?=[a-h1-8x])/g, function (x) { return { S: 'N', L: 'B', T: 'R', D: 'Q', K: 'K' }[x]; })
               .replace(/=([SLTD])/g, function (_, x) { return '=' + { S: 'N', L: 'B', T: 'R', D: 'Q' }[x]; })
               .replace(/0-0-0/g, 'O-O-O').replace(/0-0(?!-)/g, 'O-O');
    }
    var c = new L.Chess();
    try { c.loadPgn(pgn); } catch (e) { return 'PGN konnte nicht gelesen werden: ' + (e && e.message ? e.message : e); }
    var hist = c.history({ verbose: true });
    var headers = c.getHeaders ? c.getHeaders() : {};
    var start = hist.length ? hist[0].before : c.fen();
    if (!hist.length && !headers.FEN) return 'In der PGN wurden keine Züge gefunden.';
    var comments = {};
    try { (c.getComments() || []).forEach(function (x) { comments[x.fen] = x.comment; }); } catch (e) { comments = {}; }
    var clocks = hist.map(function (m) { return CO.parseClk(comments[m.after]); });
    state.sample = false;
    meta = meta || {};
    loadLine(start, hist.map(function (m) { return m.san; }), headers, meta.ply != null ? meta.ply : hist.length,
             { clocks: clocks, user: meta.user, game: meta.game });
    return null;
  }

  function loadSample() {
    state.sample = true;
    loadLine(START, SAMPLE.moves.split(' '), SAMPLE.headers, SAMPLE.ply);
  }

  function setMode(mode, silent) {
    state.mode = mode;
    if (mode === 'play') {
      if (state.main) state.main = null;
      state.orientation = state.settings.humanColor;
    } else cancelAI();
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
      state.mode = d.mode === 'play' ? 'play' : 'analyse';
      state.orientation = d.orientation === 'b' ? 'b' : 'w';
      state.headers = d.headers || {};
      state.sample = !!d.sample;
      state.user = d.user || null;
      state.game = d.game || null;
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
    var results = classifyAll();
    if (train) { renderTrain(results); return; }
    var fen = fenAt(state.ply), pi = posInfo(fen), entry = an.entry(fen);
    var last = state.ply > 0 ? state.line[state.ply - 1] : null;
    var cls = last ? results[state.ply - 1] : null;
    var engineOn = showEngineNow();
    // Im KI-Modus bewertet die Karte deinen letzten Zug (die Antwort der KI steht darunter)
    var vIdx = state.ply - 1, reply = null;
    if (state.mode === 'play' && last && last.color !== s0().humanColor && state.ply >= 2) {
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
        if (cls.key === 'brilliant' || cls.key === 'great') { pop = true; toast(cls.key); }
      }
      if (s.badges) badge = { square: last.to, key: cls.key, sym: cat.sym, label: cat.label, pop: pop };
      tint = cls.key;
    }
    var interactive = !pi.terminal && (state.mode === 'analyse' ||
      (state.ply === state.line.length && pi.turn === s.humanColor && !ai.thinking));
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
    renderStatus();
    renderControls(pi, entry, engineOn);
  }

  function toast(key) {
    var t = $('toast');
    t.hidden = true;
    t.className = 'toast c-' + key;
    t.textContent = key === 'brilliant' ? 'Brillant!!' : 'Großartig!';
    void t.offsetWidth;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2000);
  }

  function renderEval(fen, entry, pi, engineOn) {
    var wp = engineOn ? whiteWp(fen, entry) : null;
    var fill = $('evalFill'), num = $('evalNum'), bar = $('evalbar');
    bar.classList.toggle('flipped', state.orientation === 'b');
    var h = wp == null ? 50 : Math.max(2, Math.min(98, wp));
    // Weiß füllt von der Seite des weißen Spielers aus
    fill.style.height = (state.orientation === 'w' ? h : h) + '%';
    var txt = '';
    if (engineOn) {
      if (pi.terminal === 'mate') txt = pi.turn === 'w' ? '0-1' : '1-0';
      else if (pi.terminal === 'draw') txt = '½';
      else if (entry && entry.lines.length) {
        var ws = whiteScore(fen, entry.lines[0].score);
        txt = ws.mate != null ? '#' + Math.abs(ws.mate) : Math.abs(ws.cp / 100).toFixed(1);
      }
    }
    num.textContent = txt;
    var whiteAhead = wp == null || wp >= 50;
    var atBottom = (state.orientation === 'w') === whiteAhead;
    num.className = 'evalbar-num ' + (atBottom ? 'bottom' : 'top');
    num.style.color = whiteAhead ? '#26292b' : '#f5f4ef';
  }

  function playerHtml(color, results) {
    var h = state.headers, name, meta = '';
    if (state.mode === 'play') {
      name = color === state.settings.humanColor ? 'Du' : 'Stockfish · ' + level().label.replace(/\s*\(.*\)/, '');
      if (color !== state.settings.humanColor && ai.thinking) meta = '<span class="meta thinking">denkt …</span>';
    } else {
      name = color === 'w' ? (h.White && h.White !== '?' ? h.White : 'Weiß') : (h.Black && h.Black !== '?' ? h.Black : 'Schwarz');
      var elo = color === 'w' ? h.WhiteElo : h.BlackElo;
      if (elo && elo !== '?') name += ' (' + elo + ')';
    }
    var acc = accuracyFor(color, results);
    if (acc != null && state.line.length >= 4) meta += '<span class="acc-chip" title="Genauigkeit">' + acc.toFixed(1) + '</span>';
    return '<span class="swatch ' + color + '"></span><span class="pname">' + esc(name) + '</span>' + (meta ? '<span class="meta">' + meta + '</span>' : '');
  }
  // Genauigkeit erst, wenn alle Züge dieser Farbe bewertet sind
  function accuracyFor(color, results) {
    var sum = C.summarize(state.line.map(function (m, i) { return { color: m.color, cls: results[i] }; }));
    var total = state.line.filter(function (m) { return m.color === color; }).length;
    return total && sum[color].n === total ? sum[color].accuracy : null;
  }
  function renderPlayers(results) {
    var top = state.orientation === 'w' ? 'b' : 'w';
    $('playerTop').innerHTML = playerHtml(top, results);
    $('playerBottom').innerHTML = playerHtml(top === 'w' ? 'b' : 'w', results);
  }

  var PIECE = { p: 'Der Bauer', n: 'Der Springer', b: 'Der Läufer', r: 'Der Turm', q: 'Die Dame' };
  function fmtW(fen, score) { return C.fmtScore(whiteScore(fen, score)); }

  function verdictText(mv, cls, hasCoach) {
    var fb = mv.fenBefore;
    var best = cls.bestUci ? nota(uciSan(fb, cls.bestUci)) : null;
    var bestEv = cls.bestScore ? fmtW(fb, cls.bestScore) : '';
    var lossTxt = cls.loss != null ? cls.loss.toFixed(0) : '0';
    switch (cls.key) {
      case 'brilliant':
        var sq = cls.sac && cls.sac.square;
        var what = cls.sac && PIECE[cls.sac.piece] ? PIECE[cls.sac.piece] + ' auf ' + sq : 'Material';
        return what + ' wird geopfert – und Stockfish bestätigt: Das Opfer funktioniert. ' +
          'Bewertung danach <b>' + fmtW(fb, cls.playedScore) + '</b>.';
      case 'great':
        var sec = null;
        var eb = an.entry(fb);
        if (eb && eb.lines[1]) sec = nota(uciSan(fb, eb.lines[1].uci)) + ' (' + fmtW(fb, eb.lines[1].score) + ')';
        var wp = cls.wpBefore;
        var goal = wp >= C.THRESHOLDS.winWp ? 'den Vorteil hält' : (wp > 100 - C.THRESHOLDS.winWp ? 'die Stellung im Gleichgewicht hält' : 'noch Widerstand leistet');
        return 'Der einzige Zug, der ' + goal + '.' + (sec ? ' Der zweitbeste Zug ' + '<b>' + esc(sec) + '</b> wäre klar schlechter.' : '');
      case 'best':
        return 'Genau der Zug, den Stockfish empfiehlt. Bewertung <b>' + fmtW(fb, cls.playedScore) + '</b>.';
      case 'excellent':
        return 'Fast so stark wie <b>' + esc(best) + '</b> (' + bestEv + ').';
      case 'good':
        return 'Solide. Etwas genauer war <b>' + esc(best) + '</b> (' + bestEv + ').';
      case 'book':
        var name = SK.book.nameFor(fensUpTo(state.line.indexOf(mv) + 1));
        return (name ? esc(name) : 'Bekannte Eröffnungstheorie') + '.';
      case 'forced':
        return 'Der einzige legale Zug.';
      case 'miss':
        return (cls.reasons && cls.reasons[0] ? esc(cls.reasons[0]) + '. ' : '') + 'Stark war <b>' + esc(best) + '</b> (' + bestEv + '). Gewinnchance −' + lossTxt + ' %.';
      default: // inaccuracy, mistake, blunder
        var thr = '';
        var ea = an.entry(mv.fenAfter);
        if ((cls.key === 'blunder' || cls.key === 'mistake') && ea && ea.lines[0] && !hasCoach) {
          thr = ' Die Widerlegung: ' + pvText(mv.fenAfter, ea.lines[0].pv, 4) + '.';
        }
        return 'Besser war <b>' + esc(best) + '</b> (' + bestEv + '). Gewinnchance −' + lossTxt + ' %.' + thr;
    }
  }
  function fensUpTo(ply) { var a = []; for (var i = 0; i <= ply; i++) a.push(fenAt(i)); return a; }

  function article(key) {
    return { brilliant: 'ist brillant', great: 'ist großartig', best: 'ist der beste Zug', excellent: 'ist exzellent',
             good: 'ist gut', book: 'ist Theorie', forced: 'war erzwungen', inaccuracy: 'ist eine Ungenauigkeit',
             mistake: 'ist ein Fehler', miss: 'verpasst eine Chance', blunder: 'ist ein Patzer' }[key];
  }

  function moveLabel(mv, idx) {
    var num = posInfo(mv.fenBefore).fullmove;
    return num + (mv.color === 'w' ? '. ' : '… ') + nota(mv.san);
  }

  function s0() { return state.settings; }
  function renderVerdict(last, cls, pi, fen, entry, reply) {
    var el = $('verdict'), html;
    if (pi.terminal) {
      var res = pi.terminal === 'mate' ? (pi.turn === 'w' ? 'Schwarz gewinnt' : 'Weiß gewinnt') : 'Remis';
      var why = pi.terminal === 'mate' ? 'Schachmatt' : (pi.legal === 0 ? 'Patt' : 'Ungenügendes Material');
      var head = last && cls ? '<span class="san">' + esc(moveLabel(last)) + '</span> ' + article(cls.key) + '. ' : '';
      html = '<div class="v-icon ' + (cls ? 'c-' + cls.key : 'neutral') + '">' + (cls ? C.CATS[cls.key].sym : '#') + '</div>' +
             '<div class="v-title">' + why + ' – ' + res + '</div>' +
             '<div class="v-text">' + head + (state.mode === 'play' ? 'Starte über „Neue Partie gegen KI“ die nächste Runde.' : '') + '</div>';
    } else if (!last) {
      var tip = entry && entry.lines.length ? nota(uciSan(fen, entry.lines[0].uci)) : null;
      html = '<div class="v-icon neutral">?</div>' +
             '<div class="v-title">' + (state.line.length ? 'Ausgangsstellung' : 'Mach einen Zug') + '</div>' +
             '<div class="v-text">' + (state.line.length
               ? 'Blättere mit ← → durch die Partie; jeder Zug bekommt seine Bewertung.'
               : 'Zieh eine Figur auf dem Brett. Stockfish bewertet jeden Zug sofort – von brillant (!!) bis Patzer (??).') +
               (tip && showEngineNow() ? ' Stockfish empfiehlt hier <b>' + esc(tip) + '</b>.' : '') + '</div>';
    } else if (!cls) {
      html = '<div class="v-icon neutral">…</div>' +
             '<div class="v-title"><span class="san">' + esc(moveLabel(last)) + '</span></div>' +
             '<div class="v-text">' + (engine.state === 'ready' ? 'Stockfish bewertet den Zug …' : 'Wartet auf die Engine …') + '</div>';
    } else {
      var cat = C.CATS[cls.key];
      html = '<div class="v-icon c-' + cls.key + '">' + cat.sym + '</div>' +
             '<div class="v-title"><span class="san">' + esc(moveLabel(last)) + '</span> ' + article(cls.key) + '</div>' +
             '<div class="v-text">' + verdictText(last, cls, coachFor(last, cls).length > 0) + '</div>';
      var tips = coachFor(last, cls);
      if (tips.length) html += '<ul class="v-coach">' + tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      if (cls.wpBefore != null && cls.wpAfter != null && cls.key !== 'forced' && cls.key !== 'book') {
        var b = Math.round(cls.wpBefore), a = Math.round(cls.wpAfter);
        html += '<div class="v-wp" title="Gewinnchance des ziehenden Spielers: mit dem besten Zug → mit dem gespielten Zug">' +
                'Gewinnchance ' + b + ' % → ' + a + ' %' +
                '<span class="bar"><span class="before" style="width:' + b + '%"></span><span style="width:' + a + '%"></span></span></div>';
      }
    }
    if (reply && !pi.terminal) {
      html += '<div class="v-reply">Antwort der KI: <b>' + esc(moveLabel(reply.mv)) + '</b>' +
        (reply.cls ? ' <span class="sym c-' + reply.cls.key + '">' + C.CATS[reply.cls.key].sym + '</span> ' + C.CATS[reply.cls.key].label : '') + '</div>';
    }
    el.innerHTML = html;
  }

  function renderEngine(fen, entry, pi, engineOn) {
    var bm = $('bestMove'), meta = $('engineMeta'), ul = $('lines');
    if (pi.terminal) {
      bm.innerHTML = pi.terminal === 'mate' ? 'Matt' : 'Remis';
      meta.textContent = ''; ul.innerHTML = '';
      return;
    }
    if (!engineOn) {
      bm.innerHTML = '<span class="ev">versteckt</span>';
      meta.textContent = ai.thinking ? 'KI am Zug' : '';
      ul.innerHTML = '<li class="empty">Hinweise sind aus. Schalte sie oben unter „Hinweise zeigen“ ein.</li>';
      return;
    }
    if (!entry || !entry.lines.length) {
      bm.innerHTML = '…';
      meta.textContent = engine.state === 'ready' ? 'rechnet …' : '';
      ul.innerHTML = '<li class="empty">' + (engine.state === 'failed' ? 'Engine nicht verfügbar.' : 'Stockfish rechnet …') + '</li>';
      return;
    }
    var top = entry.lines[0];
    bm.innerHTML = esc(nota(uciSan(fen, top.uci))) + ' <span class="ev">' + fmtW(fen, top.score) + '</span>';
    var nps = entry.nps ? (entry.nps >= 1e6 ? (entry.nps / 1e6).toFixed(1) + ' Mio.' : Math.round(entry.nps / 1000) + ' Tsd.') + ' Knoten/s' : '';
    meta.innerHTML = 'Tiefe ' + entry.depth + (nps ? '<br>' + nps : '');
    var want = Math.max(1, +state.settings.lines);
    ul.innerHTML = entry.lines.slice(0, want).map(function (l, i) {
      var ws = whiteScore(fen, l.score);
      var neg = ws.mate != null ? ws.mate < 0 : ws.cp < 0;
      return '<li data-uci="' + l.uci + '" title="Zug ausführen"><span class="ev-chip' + (neg ? ' neg' : '') + '">' + C.fmtScore(ws) + '</span>' +
             '<span class="pv">' + pvText(fen, l.pv, 12) + '</span></li>';
    }).join('');
  }

  var movesSig = '';
  function renderMoves(results) {
    var box = $('moves');
    var sig = state.ply + '|' + state.line.map(function (m, i) { var r = results[i]; return m.id + (r ? r.key : '-'); }).join(',') + '|' + state.settings.notation;
    var op = state.line.length && bookStart() ? SK.book.nameFor(fensUpTo(state.line.length)) : null;
    $('opening').textContent = op || '';
    if (sig === movesSig) return;
    movesSig = sig;
    if (!state.line.length) {
      box.innerHTML = '<div class="empty-sheet">Noch keine Züge. Zieh auf dem Brett oder lade über „PGN / FEN laden“ eine Partie.</div>';
      return;
    }
    var html = '', first = state.line[0];
    var num = posInfo(first.fenBefore).fullmove;
    var i = 0;
    if (first.color === 'b') {
      html += '<div class="no">' + num + '</div><div class="mv"></div>' + cell(0);
      i = 1; num++;
    }
    for (; i < state.line.length; i += 2) {
      html += '<div class="no">' + num + '</div>' + cell(i) + (i + 1 < state.line.length ? cell(i + 1) : '<div class="mv"></div>');
      num++;
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
      var sym = r && r.key ? '<span class="sym c-' + r.key + (/best|excellent|good|book|forced/.test(r.key) ? ' quiet' : '') + '" title="' + C.CATS[r.key].label + '">' + C.CATS[r.key].sym + '</span>'
                           : '<span class="pend" title="wird bewertet">·</span>';
      return '<div class="mv' + (k === state.ply - 1 ? ' cur' : '') + '" data-ply="' + (k + 1) + '">' + esc(nota(m.san)) + sym + '</div>';
    }
  }

  function renderReview(results) {
    var n = state.line.length;
    $('review').hidden = n < 2;
    if (n < 2) return;
    var pr = an.reviewProgress();
    $('progress').textContent = !state.settings.autoReview ? 'automatisches Review aus'
      : (pr.done >= pr.total ? 'fertig · Tiefe ' + state.settings.reviewDepth : 'analysiert ' + pr.done + ' / ' + pr.total);
    var sum = C.summarize(state.line.map(function (m, i) { return { color: m.color, cls: results[i] }; }));
    var h = state.headers;
    var nameW = state.mode === 'play' ? (state.settings.humanColor === 'w' ? 'Du' : 'Stockfish') : (h.White && h.White !== '?' ? h.White : 'Weiß');
    var nameB = state.mode === 'play' ? (state.settings.humanColor === 'b' ? 'Du' : 'Stockfish') : (h.Black && h.Black !== '?' ? h.Black : 'Schwarz');
    function box(c, name) {
      var a = accuracyFor(c, results);
      return '<div class="box"><div class="who"><span class="swatch ' + c + '" style="width:10px;height:10px;border-radius:2px;border:1px solid var(--muted);background:' + (c === 'w' ? '#f7f6f1' : '#25282a') + '"></span>' + esc(name) + '</div>' +
             '<div class="num">' + (a == null ? '–' : a.toFixed(1)) + '<small>Genauigkeit</small></div></div>';
    }
    $('acc').innerHTML = box('w', nameW) + box('b', nameB);
    var rows = C.ORDER.filter(function (k) { return k !== 'forced'; }).map(function (k) {
      var w = sum.w.counts[k], b = sum.b.counts[k];
      return '<tr><td class="n' + (w ? '' : ' zero') + '">' + w + '</td><td class="lab"><span class="sym c-' + k + '">' + C.CATS[k].sym + '</span>' + C.CATS[k].label + '</td><td class="n' + (b ? '' : ' zero') + '">' + b + '</td></tr>';
    }).join('');
    $('counts').innerHTML = '<thead><tr><td class="n">Weiß</td><td></td><td class="n">Schwarz</td></tr></thead><tbody>' + rows + '</tbody>';
    renderGraph(results);
    renderInsights(results);
  }

  // Bewertungsverlauf: Gewinnchance von Weiß pro Halbzug
  var graphHover = null;
  function renderGraph(results) {
    var g = $('graph');
    var W = Math.max(200, g.clientWidth || 360), H = g.clientHeight || 104;
    var n = state.line.length;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = fenAt(i), wp = whiteWp(f, an.entry(f));
      pts.push(wp);
    }
    function X(i) { return n ? i / n * W : 0; }
    function Y(wp) { return H - wp / 100 * H; }
    var d = '', started = false, lastX = 0;
    for (var k = 0; k <= n; k++) {
      if (pts[k] == null) continue;
      var x = X(k).toFixed(1), y = Y(Math.max(1, Math.min(99, pts[k]))).toFixed(1);
      if (!started) { d = 'M' + x + ',' + H + ' L' + x + ',' + y; started = true; }
      else d += ' L' + x + ',' + y;
      lastX = x;
    }
    if (started) d += ' L' + lastX + ',' + H + ' Z';
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Bewertungsverlauf der Partie">' +
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

  function renderStatus() {
    var pill = $('enginePill'), t = $('engineText');
    var st = engine.state, info = engine.info;
    if (st === 'ready') {
      var job = an.job;
      var busy = job && !job.finished;
      pill.dataset.state = busy ? 'busy' : 'ready';
      var what = !busy ? 'bereit' : job.kind === 'play' ? 'KI zieht' : job.kind === 'review' ? 'Review' : 'live';
      t.textContent = info.name + (window.innerWidth < 520 ? '' : ' · ' + info.note) + ' · ' + what;
      pill.title = info.name + ' (' + info.note + ')';
    } else if (st === 'failed') {
      pill.dataset.state = 'failed';
      t.textContent = 'Engine nicht geladen – tippen für neuen Versuch';
      pill.title = engine.log.join('\n');
    } else {
      pill.dataset.state = 'loading';
      t.textContent = 'Lade Stockfish …';
    }
  }

  function renderControls(pi, entry, engineOn) {
    $('btnFirst').disabled = $('btnPrev').disabled = state.ply === 0 || !!train;
    $('btnNext').disabled = $('btnLast').disabled = state.ply >= state.line.length || !!train;
    var canBest = !pi.terminal && entry && entry.lines.length && engineOn &&
      (state.mode === 'analyse' || (state.ply === state.line.length && pi.turn === state.settings.humanColor));
    $('btnBest').disabled = !canBest || !!train;
    $('varBanner').hidden = !state.main;
    $('modeAnalyse').setAttribute('aria-selected', String(state.mode === 'analyse'));
    $('modePlay').setAttribute('aria-selected', String(state.mode === 'play'));
    $('playBox').hidden = state.mode !== 'play';
    $('btnTakeback').disabled = !state.line.length || ai.thinking;
  }


  /* ---------- Coach-Erklärungen ---------- */

  var coachMemo = new Map();
  function coachFor(mv, cls) {
    if (!mv || !cls) return [];
    var ea = an.entry(mv.fenAfter);
    var k = mv.id + '|' + cls.key + '|' + (cls.depth || 0) + '|' + (ea ? ea.depth : 0) + '|' + state.settings.notation;
    var hit = coachMemo.get(k);
    if (hit) return hit;
    var out = [];
    try {
      out = CO.explain({ fenBefore: mv.fenBefore, fenAfter: mv.fenAfter, move: mv, cls: cls, after: ea,
                         notation: state.settings.notation, clock: { left: mv.clock, spent: mv.spent } });
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
    if (acc >= 90) return { cls: 'top', txt: 'stark' };
    if (acc >= 80) return { cls: 'ok', txt: 'gut' };
    if (acc >= 65) return { cls: 'mid', txt: 'okay' };
    return { cls: 'low', txt: 'schwach' };
  }

  function renderInsights(results) {
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
      rows += '<tr><td class="lab">' + CO.PHASES[ph] + '</td>' + cell(w) + cell(b) + '</tr>';
    });
    $('phases').innerHTML = rows ? '<thead><tr><td></td><td class="ph-cell">Weiß</td><td class="ph-cell">Schwarz</td></tr></thead><tbody>' + rows + '</tbody>' : '';

    // Schlüsselmomente
    var items = [];
    state.line.forEach(function (m, i) {
      var r = results[i];
      if (!r || !/brilliant|great|miss|mistake|blunder/.test(r.key)) return;
      var tip = coachFor(m, r)[0] || '';
      var clock = m.clock != null ? '<span class="km-clock" title="Restzeit nach dem Zug">' + CO.fmtClock(m.clock) + '</span>' : '';
      items.push('<li><button type="button" class="km' + (i === state.ply - 1 ? ' cur' : '') + '" data-ply="' + (i + 1) + '">' +
        '<span class="sym c-' + r.key + '">' + C.CATS[r.key].sym + '</span>' +
        '<span class="km-main"><b>' + esc(moveLabel(m)) + '</b> ' + C.CATS[r.key].label + (tip ? '<small>' + esc(tip) + '</small>' : '') + '</span>' +
        clock + '</button></li>');
    });
    $('moments').innerHTML = items.length ? items.join('') : '<li class="km-empty">Noch keine Schlüsselmomente – sie erscheinen, sobald die Züge bewertet sind.</li>';

    // Zeit (nur mit Uhrzeiten aus der PGN)
    var hasClock = state.line.some(function (m) { return m.clock != null; });
    $('timeBox').hidden = !hasClock;
    if (hasClock) {
      var tc = CO.parseTimeControl(state.headers.TimeControl);
      var t = { w: { spent: [], press: 0, fast: 0, err: 0 }, b: { spent: [], press: 0, fast: 0, err: 0 } };
      state.line.forEach(function (m, i) {
        var x = t[m.color], r = results[i];
        if (m.spent != null) x.spent.push(m.spent);
        if (!r || !/mistake|blunder|miss/.test(r.key)) return;
        x.err++;
        var low = m.clock != null && (m.clock < 30 || (tc && m.clock < tc.base * 0.1));
        if (low) x.press++;
        else if (m.spent != null && m.spent <= 3) x.fast++;
      });
      function avg(a) { return a.length ? CO.fmtClock(a.reduce(function (p, q) { return p + q; }, 0) / a.length) : '–'; }
      $('timeStats').innerHTML =
        '<tr><td class="lab">Ø Bedenkzeit pro Zug</td><td class="n">' + avg(t.w.spent) + '</td><td class="n">' + avg(t.b.spent) + '</td></tr>' +
        '<tr><td class="lab">Fehler in Zeitnot</td><td class="n">' + t.w.press + '/' + t.w.err + '</td><td class="n">' + t.b.press + '/' + t.b.err + '</td></tr>' +
        '<tr><td class="lab">Fehler nach ≤ 3 s</td><td class="n">' + t.w.fast + '/' + t.w.err + '</td><td class="n">' + t.b.fast + '/' + t.b.err + '</td></tr>';
    }

    // Training
    var tc2 = trainColor(), cand = trainItems(results, tc2);
    var btn = $('btnTrain');
    btn.disabled = !cand.length;
    var who = state.user && state.user.color === tc2 ? 'Meine Fehler' : 'Fehler von ' + (tc2 === 'w' ? 'Weiß' : 'Schwarz');
    btn.textContent = cand.length ? who + ' trainieren (' + cand.length + ')' : who + ': nichts zu trainieren';
  }

  /* ---------- Fehler-Training (wie „Retry“ / „Lerne aus deinen Fehlern“) ---------- */

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
  function startTraining() {
    var items = trainItems(classifyAll(), trainColor());
    if (!items.length) return;
    cancelAI();
    train = { items: items, i: 0, attempt: null, status: 'try', msg: '', solved: 0, firstTry: true, hint: false };
    state.orientation = items[0].color;
    updateEngine(); render();
    var tc = $('verdict'); if (tc && tc.scrollIntoView) tc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function stopTraining(silent) {
    if (!train) return;
    clearTimeout(train.timer);
    train = null;
    if (!silent) { updateEngine(); render(); }
  }
  function trainNext() {
    if (!train) return;
    clearTimeout(train.timer);
    train.i++; train.attempt = null; train.status = train.i >= train.items.length ? 'done' : 'try';
    train.msg = ''; train.firstTry = true; train.hint = false;
    updateEngine(); render();
  }
  function trainMove(input) {
    var it = train.items[train.i];
    var mv = makeMove(it.fen, input);
    if (!mv) return;
    train.attempt = { uci: mv.uci, san: mv.san, fenAfter: mv.fenAfter, from: mv.from, to: mv.to };
    train.status = 'checking';
    animateNext = { from: mv.from, to: mv.to };
    updateEngine(); judgeAttempt(); render();
  }
  // Gilt ein Versuch als gelöst? Höchstens 5 % Gewinnchance schlechter als der beste Zug.
  function judgeAttempt() {
    if (!train || train.status !== 'checking') return;
    var it = train.items[train.i], att = train.attempt;
    var eb = an.entry(it.fen);
    var bestWp = eb && eb.lines[0] ? C.scoreWp(eb.lines[0].score) : it.cls.wpBefore;
    var wp = null;
    if (att.uci === it.played.uci) wp = -1; // der Partiezug selbst
    else if (posInfo(att.fenAfter).terminal === 'mate') wp = 100;
    else if (posInfo(att.fenAfter).terminal === 'draw') wp = 50;
    else {
      var line = eb ? eb.lines.filter(function (l) { return l.uci === att.uci; })[0] : null;
      if (line) wp = C.scoreWp(line.score);
      else {
        var ea = an.entry(att.fenAfter);
        if (!ea || ea.depth < MIN_D || !ea.lines.length) return; // weiter rechnen lassen
        wp = 100 - C.scoreWp(ea.lines[0].score);
      }
    }
    var loss = wp < 0 ? 100 : Math.max(0, bestWp - wp);
    var san = nota(att.san);
    if (loss < 5) {
      train.status = 'right';
      if (train.firstTry && !train.hint) train.solved++;
      train.msg = san + (att.uci === it.cls.bestUci ? ' ist der beste Zug!' : ' ist genauso gut – gelöst!');
    } else {
      train.status = 'wrong'; train.firstTry = false;
      train.msg = wp < 0 ? san + ' war der Zug aus der Partie. Such weiter.' : san + ' kostet ' + loss.toFixed(0) + ' % Gewinnchance. Versuch es nochmal.';
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
    train.attempt = mv ? { uci: mv.uci, san: mv.san, fenAfter: mv.fenAfter, from: mv.from, to: mv.to } : null;
    train.status = 'shown';
    train.msg = 'Lösung: ' + (mv ? nota(mv.san) : it.cls.bestUci) + '.';
    if (mv) animateNext = { from: mv.from, to: mv.to };
    updateEngine(); render();
  }

  function renderTrain(results) {
    judgeAttempt();
    var t = train, it = t.items[t.i];
    var fen = viewFen(), pi = posInfo(fen);
    var el = $('verdict'), html;
    if (t.status === 'done' || !it) {
      html = '<div class="v-icon c-best">✓</div><div class="v-title">Training beendet</div>' +
        '<div class="v-text"><b>' + t.solved + ' von ' + t.items.length + '</b> auf Anhieb gelöst.</div>' +
        '<div class="v-actions"><button type="button" class="btn accent small" data-t="again">Nochmal</button>' +
        '<button type="button" class="btn ghost small" data-t="stop">Zurück zur Partie</button></div>';
      el.innerHTML = html;
      board.render({ fen: fenAt(state.ply), orientation: state.orientation, lastMove: null, arrows: [], interactive: false });
    } else {
      var att = t.attempt;
      var arrows = [];
      if (t.status === 'right' || t.status === 'shown') arrows.push(Object.assign(uciToMove(it.cls.bestUci), { kind: 'better' }));
      var badge = null;
      if (att && (t.status === 'right' || t.status === 'wrong' || t.status === 'shown')) {
        var k = t.status === 'wrong' ? 'mistake' : 'best';
        badge = { square: att.to, key: k, sym: t.status === 'wrong' ? '✕' : '✓', label: '' };
      }
      var prev = it.idx > 0 ? state.line[it.idx - 1] : null;
      board.render({
        fen: fen, orientation: state.orientation,
        lastMove: att ? { from: att.from, to: att.to } : (prev ? { from: prev.from, to: prev.to } : null),
        check: pi.king, arrows: arrows, badge: badge, animate: animateNext,
        interactive: t.status === 'try' && !pi.terminal
      });
      animateNext = null;
      var hintTxt = '';
      if (t.hint) {
        var bm = makeMove(it.fen, uciToMove(it.cls.bestUci));
        if (bm) hintTxt = '<div class="v-hint">Tipp: Zieh mit ' + ({ p: 'einem Bauern', n: 'dem Springer', b: 'dem Läufer', r: 'dem Turm', q: 'der Dame', k: 'dem König' }[bm.piece]) + ' (von ' + bm.from + ').</div>';
      }
      var state2 = { try: '', checking: 'Stockfish prüft …', right: '', wrong: '', shown: '' }[t.status];
      html = '<div class="v-icon c-' + it.cls.key + '">' + C.CATS[it.cls.key].sym + '</div>' +
        '<div class="v-title">Fehler-Training · ' + (t.i + 1) + ' von ' + t.items.length + '</div>' +
        '<div class="v-text">In der Partie kam <b>' + esc(moveLabel(it.played)) + '</b> (' + C.CATS[it.cls.key].label + '). ' +
        'Finde einen besseren Zug für ' + (it.color === 'w' ? 'Weiß' : 'Schwarz') + '.</div>' +
        (t.msg ? '<div class="v-msg ' + t.status + '">' + esc(t.msg) + '</div>' : (state2 ? '<div class="v-msg">' + state2 + '</div>' : '')) +
        hintTxt +
        '<div class="v-actions">' +
        (t.status === 'right' || t.status === 'shown'
          ? '<button type="button" class="btn accent small" data-t="next">' + (t.i + 1 < t.items.length ? 'Nächster Fehler' : 'Auswertung') + '</button>'
          : '<button type="button" class="btn ghost small" data-t="hint"' + (t.hint ? ' disabled' : '') + '>Tipp</button>' +
            '<button type="button" class="btn ghost small" data-t="show">Lösung zeigen</button>' +
            '<button type="button" class="btn ghost small" data-t="next">Überspringen</button>') +
        '<button type="button" class="btn ghost small" data-t="stop">Beenden</button></div>';
      el.innerHTML = html;
    }
    // Engine-Hinweise würden die Lösung verraten
    $('bestMove').innerHTML = '<span class="ev">im Training verborgen</span>';
    $('engineMeta').textContent = '';
    $('lines').innerHTML = '<li class="empty">Während des Trainings ausgeblendet.</li>';
    renderEval(fen, null, pi, false);
    renderPlayers(results);
    renderMoves(results);
    renderReview(results);
    renderStatus();
    renderControls(pi, null, false);
  }

  /* ---------- Konnektor: deine beendeten Partien ---------- */

  var conn = { games: [], busy: false, timer: null, lastCheck: 0, error: null };
  function connStatus(txt, kind) {
    var el = $('connStatus');
    el.textContent = txt || '';
    el.dataset.kind = kind || '';
  }
  function siteName(site) { return site === 'lichess' ? 'lichess' : 'chess.com'; }
  function connFetch(limit) {
    var s = state.settings;
    return SK.connect.fetchGames(s.connSite, s.connUser, { limit: limit || 20 });
  }
  function connErrorText(e) {
    if (e && e.code === 'blocked') return 'Diese gehostete Seite darf keine Verbindung zu ' + siteName(state.settings.connSite) +
      ' aufbauen. Öffne zugradar.html lokal (siehe README), dort funktioniert der Konnektor. Alternativ: PGN einfügen.';
    return (e && e.message) || 'Unbekannter Fehler.';
  }
  function connLoadList() {
    var s = state.settings;
    s.connUser = $('connUser').value.trim();
    s.connSite = $('connSite').value;
    save();
    if (!s.connUser) { connStatus('Bitte deinen Benutzernamen eingeben.', 'error'); return; }
    conn.busy = true;
    connStatus('Lade Partien von ' + siteName(s.connSite) + ' …', 'busy');
    $('connGames').innerHTML = '';
    connFetch(20).then(function (games) {
      conn.busy = false; conn.games = games; conn.lastCheck = Date.now();
      if (games.length && !s.connLast) { s.connLast = games[0].end; save(); }
      connStatus(games.length ? games.length + ' beendete Partien von ' + s.connUser + '.' : 'Keine beendeten Partien gefunden.', games.length ? 'ok' : '');
      renderGames();
    }, function (e) {
      conn.busy = false;
      connStatus(connErrorText(e), 'error');
    });
  }
  function fmtDate(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtTc(tc) {
    var t = CO.parseTimeControl(tc);
    if (!t) return tc ? 'Fernschach' : '';
    return (t.base >= 60 ? Math.round(t.base / 60) : t.base + ' s') + '+' + t.inc;
  }
  function renderGames() {
    var ul = $('connGames');
    ul.innerHTML = conn.games.map(function (g, i) {
      var me = g.userColor, opp = me === 'b' ? g.white : g.black;
      var res = g.userResult === 'win' ? ['S', 'win', 'Sieg'] : g.userResult === 'loss' ? ['N', 'loss', 'Niederlage'] : g.userResult === 'draw' ? ['R', 'draw', 'Remis'] : ['·', 'draw', g.result];
      var speed = SK.connect.SPEED[g.speed] || g.speed || '';
      return '<li><button type="button" class="game" data-i="' + i + '">' +
        '<span class="res ' + res[1] + '" title="' + res[2] + '">' + res[0] + '</span>' +
        '<span class="g-main"><b>' + (me ? 'vs. ' : '') + esc(me ? opp.name : g.white.name + ' – ' + g.black.name) + (me && opp.rating ? ' (' + opp.rating + ')' : '') + '</b>' +
        '<small>' + [speed, fmtTc(g.timeControl), me ? 'mit ' + (me === 'w' ? 'Weiß' : 'Schwarz') : '', fmtDate(g.end)].filter(Boolean).join(' · ') + '</small></span>' +
        '<span class="g-go">Analysieren</span></button></li>';
    }).join('');
  }
  function loadGame(g, silent) {
    var err = importText(g.pgn, {
      user: g.userColor ? { name: g.userColor === 'w' ? g.white.name : g.black.name, color: g.userColor } : null,
      game: { site: g.site, id: g.id, url: g.url }, ply: 0
    });
    if (err) { connStatus(err, 'error'); return false; }
    if (!silent) closeImport();
    return true;
  }
  // Auto-Import: prüft jede Minute, ob eine NEUE, BEENDETE Partie dazugekommen ist
  function connSchedule() {
    clearInterval(conn.timer); conn.timer = null;
    var s = state.settings;
    $('autoChip').hidden = !(s.connAuto && s.connUser);
    if (!(s.connAuto && s.connUser)) return;
    $('autoChip').textContent = 'Auto-Import · ' + s.connUser;
    conn.timer = setInterval(connPoll, 60000);
  }
  function connPoll() {
    var s = state.settings;
    if (!(s.connAuto && s.connUser) || conn.busy) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    conn.busy = true;
    connFetch(5).then(function (games) {
      conn.busy = false; conn.lastCheck = Date.now();
      var fresh = games.filter(function (g) { return g.end > (s.connLast || 0); });
      if (!fresh.length) { connStatus('Zuletzt geprüft ' + fmtDate(conn.lastCheck).split(' ')[1] + ' – keine neue Partie.', ''); return; }
      var g = fresh[0];
      s.connLast = g.end; save();
      conn.games = games; renderGames();
      // Nicht mitten in einer Partie gegen die KI oder im Training überschreiben
      if (state.mode === 'play' || train) { connStatus('Neue Partie verfügbar – öffne „Partie laden“, um sie zu analysieren.', 'ok'); return; }
      if (loadGame(g, true)) {
        showToastText('Neue Partie geladen');
        connStatus('Neue Partie automatisch geladen: ' + fmtDate(g.end) + '.', 'ok');
      }
    }, function (e) {
      conn.busy = false;
      connStatus(connErrorText(e), 'error');
      if (e && e.code === 'blocked') { s.connAuto = false; $('connAuto').checked = false; save(); connSchedule(); }
    });
  }
  function showToastText(txt) {
    var t = $('toast');
    t.hidden = true; t.className = 'toast c-great'; t.textContent = txt;
    void t.offsetWidth; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2000);
  }

  /* ---------- Export ---------- */

  function exportPgn() {
    var results = classifyAll();
    var h = Object.assign({ Event: 'Zugradar-Analyse', Site: '?', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: '?', Black: '?', Result: '*' }, state.headers);
    var pi = posInfo(fenAt(state.line.length));
    if (pi.terminal) h.Result = pi.terminal === 'mate' ? (pi.turn === 'w' ? '0-1' : '1-0') : '1/2-1/2';
    if (state.startFen !== START) { h.SetUp = '1'; h.FEN = state.startFen; }
    var order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    var keys = order.filter(function (k) { return h[k] != null; }).concat(Object.keys(h).filter(function (k) { return order.indexOf(k) < 0; }));
    var out = keys.map(function (k) { return '[' + k + ' "' + String(h[k]).replace(/"/g, "'") + '"]'; }).join('\n') + '\n\n';
    var toks = [];
    state.line.forEach(function (m, i) {
      var num = posInfo(m.fenBefore).fullmove;
      var r = results[i];
      var t = (m.color === 'w' ? num + '. ' : (i === 0 ? num + '... ' : '')) +
              m.san + (r && C.CATS[r.key].nag ? C.CATS[r.key].nag : '');
      var e = an.entry(m.fenAfter);
      if (e && e.lines[0]) {
        var ws = whiteScore(m.fenAfter, e.lines[0].score);
        t += ' {[%eval ' + (ws.mate != null ? '#' + ws.mate : (ws.cp / 100).toFixed(2)) + ']' + (r ? ' ' + C.CATS[r.key].label : '') + '}';
      }
      toks.push(t);
    });
    toks.push(h.Result);
    // Zeilen auf ~80 Zeichen umbrechen
    var line = '', lines = [];
    toks.forEach(function (t) { if ((line + ' ' + t).length > 80) { lines.push(line); line = t; } else line = line ? line + ' ' + t : t; });
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

    $('btnFirst').onclick = function () { go(0); };
    $('btnPrev').onclick = function () { go(state.ply - 1); };
    $('btnNext').onclick = function () { go(state.ply + 1, true); };
    $('btnLast').onclick = function () { go(state.line.length); };
    $('btnFlip').onclick = function () { state.orientation = state.orientation === 'w' ? 'b' : 'w'; save(); render(); };
    $('btnBest').onclick = playBest;
    $('btnNew').onclick = function () { if (state.mode === 'play') newGame(); else { state.sample = false; newGame(); } };
    $('btnMain').onclick = function () {
      if (!state.main) return;
      state.line = state.main.line; state.ply = state.main.ply; state.main = null;
      changed();
    };
    $('lines').addEventListener('click', function (e) {
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

    // Fehler-Training
    $('btnTrain').onclick = startTraining;
    $('verdict').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]');
      if (!b || !train) return;
      var a = b.dataset.t;
      if (a === 'next') trainNext();
      else if (a === 'show') trainReveal();
      else if (a === 'hint') { train.hint = true; render(); }
      else if (a === 'stop') stopTraining();
      else if (a === 'again') { stopTraining(true); startTraining(); }
    });

    // Modus
    $('modeAnalyse').onclick = function () { if (state.mode !== 'analyse') setMode('analyse'); };
    $('modePlay').onclick = function () { if (state.mode !== 'play') setMode('play'); };
    var selLevel = $('selLevel');
    selLevel.innerHTML = LEVELS.map(function (l) { return '<option value="' + l.id + '">' + l.label + '</option>'; }).join('');
    $('btnPlayNew').onclick = function () { state.mode = 'play'; newGame(); };
    $('btnTakeback').onclick = function () {
      if (!state.line.length) return;
      cancelAI();
      var n = state.line.length;
      var back = state.line[n - 1].color === state.settings.humanColor ? 1 : 2;
      state.line = state.line.slice(0, Math.max(0, n - back));
      state.ply = state.line.length;
      changed();
    };

    // Einstellungen
    function bindSel(id, key, num) {
      var el = $(id);
      el.value = String(state.settings[key]);
      el.onchange = function () {
        state.settings[key] = num ? +el.value : el.value;
        if (key === 'humanColor' && state.mode === 'play') state.orientation = el.value;
        applyEngineCfg(); movesSig = ''; changed();
      };
    }
    function bindChk(id, key) {
      var el = $(id);
      el.checked = !!state.settings[key];
      el.onchange = function () { state.settings[key] = el.checked; applyEngineCfg(); changed(); };
    }
    bindSel('selColor', 'humanColor');
    bindSel('selLevel', 'level');
    bindSel('selLive', 'liveMax', true);
    bindSel('selReview', 'reviewDepth', true);
    bindSel('selLines', 'lines', true);
    bindSel('selNotation', 'notation');
    bindChk('chkHints', 'hints');
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
    $('connAuto').checked = !!state.settings.connAuto;
    $('connLoad').onclick = connLoadList;
    $('connUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') connLoadList(); });
    $('connSite').onchange = function () { state.settings.connSite = $('connSite').value; state.settings.connLast = 0; save(); };
    $('connAuto').onchange = function () {
      var s = state.settings;
      s.connAuto = $('connAuto').checked;
      s.connUser = $('connUser').value.trim() || s.connUser;
      save(); connSchedule();
      if (s.connAuto && !s.connUser) connStatus('Für den Auto-Import erst den Benutzernamen eingeben.', 'error');
      else if (s.connAuto) { connStatus('Auto-Import aktiv: Zugradar prüft jede Minute auf neue, beendete Partien.', 'ok'); if (!conn.games.length) connLoadList(); }
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
      var t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
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
        $('importError').textContent = 'Kopieren wurde blockiert – die PGN ist markiert, kopiere sie mit Strg+C.';
        $('importError').hidden = false;
      }
      try {
        navigator.clipboard.writeText(pgn).then(function () {
          note.textContent = 'PGN kopiert (mit Bewertungen).'; note.hidden = false;
          setTimeout(function () { note.hidden = true; }, 2500);
        }, fallback);
      } catch (e) { fallback(); }
    };

    $('enginePill').onclick = function () { if (engine.state === 'failed') { engine.log = []; engine.start(); } };

    // Graph: Hover + Klick
    var g = $('graph');
    function plyAt(e) {
      var b = g.getBoundingClientRect(), n = state.line.length;
      return Math.max(0, Math.min(n, Math.round((e.clientX - b.left) / b.width * n)));
    }
    g.addEventListener('pointermove', function (e) { graphHover = plyAt(e); renderGraph(classifyAll()); });
    g.addEventListener('pointerleave', function () { graphHover = null; renderGraph(classifyAll()); });
    g.addEventListener('click', function (e) { go(plyAt(e)); });
    window.addEventListener('resize', function () { soon(); });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Escape' && !$('importBox').hidden) { closeImport(); return; }
      if (!$('importBox').hidden) return;
      if (train) { if (e.key === 'Escape') stopTraining(); return; }
      if (e.key === 'ArrowLeft') { go(state.ply - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(state.ply + 1, true); e.preventDefault(); }
      else if (e.key === 'Home') { go(0); e.preventDefault(); }
      else if (e.key === 'End') { go(state.line.length); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') { $('btnFlip').click(); }
      else if (e.key === ' ' && !$('btnBest').disabled && e.target === document.body) { playBest(); e.preventDefault(); }
    });
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

  function playBest() {
    if (train) return;
    var fen = fenAt(state.ply), e = an.entry(fen);
    if (!e || !e.lines.length) return;
    userMove(uciToMove(e.lines[0].uci));
  }

  /* ---------- Start ---------- */

  function init() {
    SK.book.build(L);
    var had = restore();
    bind();
    if (!had) {
      state.sample = true;
      var sans = SAMPLE.moves.split(' '), fen = START, line = [];
      for (var i = 0; i < sans.length; i++) { var mv = makeMove(fen, sans[i]); if (!mv) break; line.push(mv); fen = mv.fenAfter; }
      state.line = line; state.ply = SAMPLE.ply; state.headers = SAMPLE.headers;
    }
    render();
    engine.start();
    connSchedule();
    // Test-Hook (Selbsttests im Browser)
    window.__zugradar = { state: state, an: an, engine: engine, classifyAll: classifyAll, userMove: userMove, go: go,
                          importText: importText, exportPgn: exportPgn, setMode: setMode, newGame: newGame, render: render,
                          startTraining: startTraining, trainMove: trainMove, train: function () { return train; },
                          connPoll: connPoll, coachFor: coachFor };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
