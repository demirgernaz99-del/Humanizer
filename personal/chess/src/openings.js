/* SK.book – Eröffnungen und Theorie.
   Grundlage: 3.815 benannte Eröffnungen aus lichess-org/chess-openings (CC0), vorberechnet in openings-db.js
   (Stellungs-Fingerabdrücke). Erkennung über die Stellung, also auch bei Zugumstellung.
   Namen werden englisch gespeichert und für die Anzeige übersetzt (display). */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  function DB() {
    if (root.SK.openingsDb) return root.SK.openingsDb;
    if (typeof require === 'function') { try { require('./openings-db.js'); } catch (e) { /* egal */ } }
    return root.SK.openingsDb;
  }
  var lib = null, entries = null, named = null, book = null;
  function posKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }
  // FNV-1a, 32 Bit – identisch mit tools/openings_build.js
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function init() {
    if (entries) return;
    var d = DB();
    entries = d.e.split('\n').map(function (line) {
      var p = line.split('|');
      return { eco: p[0], fam: d.fam[+p[1]], variation: p[2], plies: +p[3] };
    });
    named = new Map();
    d.n.split(',').forEach(function (x) { var i = x.indexOf(':'); named.set(x.slice(0, i), parseInt(x.slice(i + 1), 36)); });
    book = new Map();
    d.b.split(',').forEach(function (x) { var i = x.indexOf('.'); if (i < 0) book.set(x, 1); else book.set(x.slice(0, i), parseInt(x.slice(i + 1), 36)); });
  }
  function build(ChessLib) { if (ChessLib) lib = ChessLib; init(); return named; }
  function L() { return lib || root.SK.ChessLib || (typeof require === 'function' ? require('./vendor/chess.js') : null); }
  function fullName(e) { return e.fam + (e.variation ? ': ' + e.variation : ''); }

  // Theorie-Stellung? → { name, eco } (name = null bei unbenannten Zwischenstellungen) oder null
  function lookup(fen) {
    init();
    var k = hash(posKey(fen)), idx = named.get(k);
    if (idx == null && !book.has(k)) return null;
    var e = idx != null ? entries[idx] : null;
    return { name: e ? fullName(e) : null, eco: e ? e.eco : null, weight: book.get(k) || 1 };
  }
  // Name entlang der Partie: letzte benannte Stellung, solange die Partie in der Theorie bleibt
  function infoFor(fens) {
    var best = null;
    for (var i = 0; i < fens.length; i++) {
      var e = lookup(fens[i]);
      if (!e) { if (i > 0) break; else continue; }
      if (e.name) best = e;
    }
    return best;
  }
  function nameFor(fens) { var e = infoFor(fens); return e ? e.name : null; }

  // Theoriezüge in einer Stellung: [{ san, uci, name, eco }], benannte zuerst
  function continuations(fen) {
    init();
    var C = L(), c = new C.Chess(fen), out = [];
    c.moves({ verbose: true }).forEach(function (m) {
      var c2 = new C.Chess(fen);
      c2.move(m);
      var e = lookup(c2.fen());
      if (e) out.push({ san: m.san, uci: m.from + m.to + (m.promotion || ''), name: e.name, eco: e.eco, weight: e.weight });
    });
    // Hauptzüge zuerst: je mehr Theorie-Linien durch den Zug führen, desto wichtiger
    out.sort(function (a, b) { return b.weight - a.weight || (b.name ? 1 : 0) - (a.name ? 1 : 0); });
    return out;
  }

  /* ---------- Deutsche Namen ---------- */
  var FAM_DE = {
    'Sicilian Defense': 'Sizilianische Verteidigung', 'French Defense': 'Französische Verteidigung', 'Ruy Lopez': 'Spanische Partie',
    'Italian Game': 'Italienische Partie', 'Scotch Game': 'Schottische Partie', 'Four Knights Game': 'Vierspringerspiel',
    'Three Knights Opening': 'Dreispringerspiel', "Queen's Gambit": 'Damengambit', "Queen's Gambit Accepted": 'Angenommenes Damengambit',
    "Queen's Gambit Declined": 'Abgelehntes Damengambit', "King's Gambit": 'Königsgambit', "King's Gambit Accepted": 'Angenommenes Königsgambit',
    "King's Gambit Declined": 'Abgelehntes Königsgambit', "King's Indian Defense": 'Königsindische Verteidigung',
    "King's Indian Attack": 'Königsindischer Angriff', "Queen's Indian Defense": 'Damenindische Verteidigung',
    "Queen's Indian Accelerated": 'Beschleunigte Damenindische Verteidigung', "Pseudo Queen's Indian Defense": 'Pseudo-Damenindische Verteidigung',
    'Nimzo-Indian Defense': 'Nimzowitsch-Indische Verteidigung', 'Bogo-Indian Defense': 'Bogoljubow-Indische Verteidigung',
    'Old Indian Defense': 'Altindische Verteidigung', 'East Indian Defense': 'Ostindische Verteidigung', 'Indian Defense': 'Indische Verteidigung',
    'Grünfeld Defense': 'Grünfeld-Indische Verteidigung', 'Neo-Grünfeld Defense': 'Neo-Grünfeld-Verteidigung',
    'Caro-Kann Defense': 'Caro-Kann-Verteidigung', 'Slav Defense': 'Slawische Verteidigung', 'Semi-Slav Defense': 'Halbslawische Verteidigung',
    'Semi-Slav Defense Accepted': 'Angenommene Halbslawische Verteidigung', 'Slav Indian': 'Slawisch-Indisch',
    'Catalan Opening': 'Katalanische Eröffnung', 'English Opening': 'Englische Eröffnung', 'English Defense': 'Englische Verteidigung',
    'Dutch Defense': 'Holländische Verteidigung', 'Center Game': 'Mittelgambit', 'Center Game Accepted': 'Angenommenes Mittelgambit',
    "Petrov's Defense": 'Russische Verteidigung', 'Philidor Defense': 'Philidor-Verteidigung', 'Pirc Defense': 'Pirc-Verteidigung',
    'Modern Defense': 'Moderne Verteidigung', 'Alekhine Defense': 'Aljechin-Verteidigung', 'Scandinavian Defense': 'Skandinavische Verteidigung',
    'Vienna Game': 'Wiener Partie', 'Vienna Gambit, with Max Lange Defense': 'Wiener Gambit mit Max-Lange-Verteidigung',
    "Bishop's Opening": 'Läuferspiel', "King's Pawn Game": 'Königsbauernspiel', "King's Pawn Opening": 'Königsbauerneröffnung',
    "King's Knight Opening": 'Königsspringer-Eröffnung', "Queen's Pawn Game": 'Damenbauernspiel',
    "Queen's Pawn, Mengarini Attack": 'Damenbauernspiel, Mengarini-Angriff', 'Réti Opening': 'Réti-Eröffnung',
    'Zukertort Opening': 'Zukertort-Eröffnung', 'Bird Opening': 'Bird-Eröffnung', 'Polish Opening': 'Polnische Eröffnung',
    'Polish Defense': 'Polnische Verteidigung', 'English Orangutan': 'Englischer Orang-Utan', 'Benoni Defense': 'Benoni-Verteidigung',
    'Benko Gambit': 'Wolga-Gambit', 'Benko Gambit Accepted': 'Angenommenes Wolga-Gambit', 'Benko Gambit Declined': 'Abgelehntes Wolga-Gambit',
    'Danish Gambit': 'Nordisches Gambit', 'Danish Gambit Accepted': 'Angenommenes Nordisches Gambit', 'Danish Gambit Declined': 'Abgelehntes Nordisches Gambit',
    'Latvian Gambit': 'Lettisches Gambit', 'Latvian Gambit Accepted': 'Angenommenes Lettisches Gambit', 'Elephant Gambit': 'Elefantengambit',
    'London System': 'Londoner System', 'Hungarian Opening': 'Ungarische Eröffnung', 'Czech Defense': 'Tschechische Verteidigung',
    'Hippopotamus Defense': 'Nilpferd-Verteidigung', 'Kangaroo Defense': 'Känguru-Verteidigung', 'Rat Defense': 'Ratten-Verteidigung',
    'Nimzo-Larsen Attack': 'Nimzowitsch-Larsen-Angriff', 'St. George Defense': 'St.-Georgs-Verteidigung', 'Australian Defense': 'Australische Verteidigung',
    'Mexican Defense': 'Mexikanische Verteidigung', 'Portuguese Opening': 'Portugiesische Eröffnung', 'Dresden Opening': 'Dresdner Eröffnung',
    'Irish Gambit': 'Irisches Gambit', 'Formation': 'Aufstellung', 'Lion Defense': 'Löwen-Verteidigung', 'Vulture Defense': 'Geier-Verteidigung',
    'Pterodactyl Defense': 'Pterodaktylus-Verteidigung', 'Colle System': 'Colle-System', 'Torre Attack': 'Torre-Angriff',
    'Trompowsky Attack': 'Trompowsky-Angriff', 'Tarrasch Defense': 'Tarrasch-Verteidigung', 'Swedish': 'Schwedisch'
  };
  // Typwort → [deutsches Wort, Geschlecht]
  var TYPE = {
    Opening: ['Eröffnung', 'f'], Defense: ['Verteidigung', 'f'], Gambit: ['Gambit', 'n'], Countergambit: ['Gegengambit', 'n'],
    Attack: ['Angriff', 'm'], Counterattack: ['Gegenangriff', 'm'], System: ['System', 'n'], Game: ['Partie', 'f'],
    Formation: ['Aufstellung', 'f'], Variation: ['Variante', 'f'], Line: ['Linie', 'f'], Trap: ['Falle', 'f'], Setup: ['Aufbau', 'm'],
    Opening_: ['Eröffnung', 'f']
  };
  var ADJ = {
    Classical: 'klassisch', Modern: 'modern', Closed: 'geschlossen', Open: 'offen', Normal: 'normal', Accelerated: 'beschleunigt',
    Symmetrical: 'symmetrisch', Reversed: 'umgekehrt', Orthodox: 'orthodox', Quiet: 'ruhig', Traditional: 'traditionell',
    English: 'englisch', French: 'französisch', Russian: 'russisch', Italian: 'italienisch', Spanish: 'spanisch', Scotch: 'schottisch',
    Dutch: 'holländisch', Polish: 'polnisch', Hungarian: 'ungarisch', Czech: 'tschechisch', Swedish: 'schwedisch', Danish: 'nordisch',
    Austrian: 'österreichisch', Yugoslav: 'jugoslawisch', Old: 'alt', New: 'neu', Improved: 'verbessert', Central: 'zentral',
    Accepted: 'angenommen', Declined: 'abgelehnt', Deferred: 'verzögert', Refused: 'abgelehnt', Delayed: 'verzögert', Poisoned: 'vergiftet'
  };
  var NOUN = {
    Exchange: 'Abtausch', Advance: 'Vorstoß', Fianchetto: 'Fianchetto', Wing: 'Flügel', Double: 'Doppel', Knight: 'Springer',
    Knights: 'Springer', Two: 'Zwei', Three: 'Drei', Four: 'Vier', "Queen's": 'Damen', "King's": 'Königs', Pawn: 'Bauern',
    Bishop: 'Läufer', Queen: 'Damen', King: 'Königs', Rook: 'Turm', Main: 'Haupt', Center: 'Zentrums', Centre: 'Zentrums',
    Dragon: 'Drachen', Hedgehog: 'Igel', Pawns: 'Bauern', Pieces: 'Figuren'
  };
  var END = { m: 'er', f: 'e', n: 'es' };
  function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
  function adj(stem, g) { return cap(stem + END[g]); }
  // Einen Namensteil übersetzen (z. B. "Najdorf Variation", "English Attack", "Exchange Variation", "Gambit Accepted")
  function chunkDe(chunk) {
    var w = chunk.split(' ');
    if (w[0] === 'with') return 'mit ' + w.slice(1).join(' ');
    if (chunk === 'Main Line') return 'Hauptvariante';
    var last = w[w.length - 1];
    if (ADJ[last] && w.length > 1 && (last === 'Accepted' || last === 'Declined' || last === 'Refused' || last === 'Deferred')) {
      var inner = chunkParts(w.slice(0, -1));
      return inner ? adj(ADJ[last], inner.g) + ' ' + inner.text : chunk;
    }
    var p = chunkParts(w);
    return p ? p.text : chunk;
  }
  function chunkParts(w) {
    var last = w[w.length - 1], ty = TYPE[last];
    if (w.length >= 2 && w[w.length - 2] === 'Main' && last === 'Line') {
      var pre = w.slice(0, -2);
      if (!pre.length) return { text: 'Hauptvariante', g: 'f' };
      if (pre.length === 1 && ADJ[pre[0]]) return { text: adj(ADJ[pre[0]], 'f') + ' Hauptvariante', g: 'f' };
      return { text: pre.join('-') + '-Hauptvariante', g: 'f' };
    }
    if (!ty) return null;
    var prefix = w.slice(0, -1);
    if (!prefix.length) return { text: ty[0], g: ty[1] };
    if (ADJ[prefix[0]]) {
      var rest = prefix.slice(1);
      if (!rest.length) return { text: adj(ADJ[prefix[0]], ty[1]) + ' ' + ty[0], g: ty[1] };
      var inner = chunkParts(rest.concat([last]));
      return inner ? { text: adj(ADJ[prefix[0]], ty[1]) + ' ' + inner.text, g: ty[1] } : null;
    }
    if (prefix.every(function (x) { return NOUN[x]; })) {
      return { text: cap(prefix.map(function (x) { return NOUN[x]; }).join('').toLowerCase()) + ty[0].toLowerCase(), g: ty[1] };
    }
    // Eigennamen: "Max Lange Attack" → "Max-Lange-Angriff", "Petrov's" → "Petrow"
    var names = prefix.map(function (x) { return x.replace(/'s$/, ''); });
    return { text: names.join('-') + '-' + ty[0], g: ty[1] };
  }
  // Varianten mit eigenem deutschen Namen
  var VAR_DE = {
    'Wayward Queen Attack': 'Parham-Angriff', 'Two Knights Defense': 'Zweispringerspiel im Nachzuge', 'Fried Liver Attack': 'Fegatello-Angriff',
    'Berlin Defense': 'Berliner Verteidigung', 'Accelerated Dragon': 'Beschleunigter Drachen', 'Hyperaccelerated Dragon': 'Hyperbeschleunigter Drachen',
    'Giuoco Piano': 'Giuoco Piano', 'Giuoco Pianissimo': 'Giuoco Pianissimo', 'Stonewall Attack': 'Stonewall-Angriff',
    'Orangutan': 'Orang-Utan', 'Hedgehog System': 'Igel-System', 'Yugoslav Attack': 'Jugoslawischer Angriff',
    'Nimzowitsch Defense': 'Nimzowitsch-Verteidigung', 'Richter-Rauzer Variation': 'Richter-Rauser-Angriff'
  };
  var deCache = new Map();
  function deName(en) {
    if (!en) return en;
    if (deCache.has(en)) return deCache.get(en);
    var cut = en.indexOf(': '), fam = cut < 0 ? en : en.slice(0, cut), vari = cut < 0 ? '' : en.slice(cut + 2);
    var famDe = FAM_DE[fam];
    if (!famDe) {
      var fc = fam.split(', ');
      famDe = fc.map(function (x) { return x === fc[0] ? (FAM_DE[x] || chunkDe(x)) : chunkDe(x); }).join(' ');
    }
    var out = famDe + (vari ? ': ' + vari.split(', ').map(function (x) { return VAR_DE[x] || chunkDe(x); }).join(', ') : '');
    deCache.set(en, out);
    return out;
  }

  // Namen früherer Versionen (deutsch gespeichert) → englisch, für alte Bibliothekseinträge
  var LEGACY = {
    'Königsbauernspiel': "King's Pawn Opening",
    'Damenbauernspiel': "Queen's Pawn Opening",
    'Englische Eröffnung': "English Opening",
    'Réti-Eröffnung': "Réti Opening",
    'Bird-Eröffnung': "Bird's Opening",
    'Larsen-Eröffnung': "Larsen's Opening",
    'Sizilianische Verteidigung': "Sicilian Defense",
    'Sizilianisch: Offene Variante': "Sicilian: Open",
    'Sizilianisch: Najdorf': "Sicilian: Najdorf",
    'Sizilianisch: Drachen': "Sicilian: Dragon",
    'Sizilianisch: Klassisch': "Sicilian: Classical",
    'Sizilianisch: Scheveningen': "Sicilian: Scheveningen",
    'Sizilianisch: Sweschnikow': "Sicilian: Sveshnikov",
    'Sizilianisch: Taimanow': "Sicilian: Taimanov",
    'Sizilianisch: Kan': "Sicilian: Kan",
    'Sizilianisch: Beschleunigter Drachen': "Sicilian: Accelerated Dragon",
    'Sizilianisch: Alapin': "Sicilian: Alapin",
    'Sizilianisch: Smith-Morra-Gambit': "Sicilian: Smith-Morra Gambit",
    'Sizilianisch: Rossolimo': "Sicilian: Rossolimo",
    'Sizilianisch: Moskauer Variante': "Sicilian: Moscow Variation",
    'Sizilianisch: Geschlossen': "Sicilian: Closed",
    'Sizilianisch: Grand-Prix-Angriff': "Sicilian: Grand Prix Attack",
    'Französische Verteidigung': "French Defense",
    'Französisch': "French Defense",
    'Französisch: Vorstoßvariante': "French: Advance",
    'Französisch: Winawer': "French: Winawer",
    'Französisch: Klassisch': "French: Classical",
    'Französisch: Rubinstein': "French: Rubinstein",
    'Französisch: Tarrasch': "French: Tarrasch",
    'Französisch: Abtauschvariante': "French: Exchange",
    'Caro-Kann-Verteidigung': "Caro-Kann Defense",
    'Caro-Kann': "Caro-Kann Defense",
    'Caro-Kann: Vorstoßvariante': "Caro-Kann: Advance",
    'Caro-Kann: Klassisch': "Caro-Kann: Classical",
    'Caro-Kann: Abtauschvariante': "Caro-Kann: Exchange",
    'Caro-Kann: Panow-Angriff': "Caro-Kann: Panov Attack",
    'Caro-Kann: Zweispringervariante': "Caro-Kann: Two Knights",
    'Skandinavische Verteidigung': "Scandinavian Defense",
    'Skandinavisch: Hauptvariante': "Scandinavian: Main Line",
    'Pirc-Verteidigung': "Pirc Defense",
    'Pirc: Österreichischer Angriff': "Pirc: Austrian Attack",
    'Moderne Verteidigung': "Modern Defense",
    'Aljechin-Verteidigung': "Alekhine's Defense",
    'Owen-Verteidigung': "Owen's Defense",
    'Nimzowitsch-Verteidigung': "Nimzowitsch Defense",
    'Offene Spiele': "King's Pawn Game",
    'Königsspringerspiel': "King's Knight Opening",
    'Parham-Angriff': "Parham Attack",
    'Italienische Partie': "Italian Game",
    'Italienisch: Giuoco Piano': "Italian: Giuoco Piano",
    'Italienisch: Giuoco Pianissimo': "Italian: Giuoco Pianissimo",
    'Italienisch: Hauptvariante': "Italian: Main Line",
    'Evans-Gambit': "Evans Gambit",
    'Zweispringerspiel im Nachzuge': "Two Knights Defense",
    'Zweispringerspiel: Springerangriff': "Two Knights: Knight Attack",
    'Zweispringerspiel: Fegatello (Fried Liver)': "Two Knights: Fried Liver Attack",
    'Zweispringerspiel: Traxler': "Two Knights: Traxler",
    'Ungarische Verteidigung': "Hungarian Defense",
    'Spanische Partie': "Ruy Lopez",
    'Spanisch: Morphy-Verteidigung': "Ruy Lopez: Morphy Defense",
    'Spanisch: Geschlossen': "Ruy Lopez: Closed",
    'Spanisch: Marshall-Angriff': "Ruy Lopez: Marshall Attack",
    'Spanisch: Offen': "Ruy Lopez: Open",
    'Spanisch: Berliner Verteidigung': "Ruy Lopez: Berlin Defense",
    'Spanisch: Berliner Mauer': "Ruy Lopez: Berlin Wall",
    'Spanisch: Abtauschvariante': "Ruy Lopez: Exchange",
    'Schottische Partie': "Scotch Game",
    'Schottisch: Hauptvariante': "Scotch: Main Line",
    'Schottisches Gambit': "Scotch Gambit",
    'Dreispringerspiel': "Three Knights Game",
    'Vierspringerspiel': "Four Knights Game",
    'Ponziani-Eröffnung': "Ponziani Opening",
    'Russische Verteidigung (Petroff)': "Petrov Defense",
    'Philidor-Verteidigung': "Philidor Defense",
    'Lettisches Gambit': "Latvian Gambit",
    'Königsgambit': "King's Gambit",
    'Königsgambit angenommen': "King's Gambit Accepted",
    'Wiener Partie': "Vienna Game",
    'Läuferspiel': "Bishop's Opening",
    'Mittelgambit': "Center Game",
    'Damengambit': "Queen's Gambit",
    'Damengambit angenommen': "Queen's Gambit Accepted",
    'Damengambit abgelehnt': "Queen's Gambit Declined",
    'Damengambit: Orthodoxe Verteidigung': "QGD: Orthodox Defense",
    'Damengambit: Abtauschvariante': "QGD: Exchange Variation",
    'Tarrasch-Verteidigung': "Tarrasch Defense",
    'Slawische Verteidigung': "Slav Defense",
    'Slawisch: Abtauschvariante': "Slav: Exchange",
    'Halbslawisch': "Semi-Slav Defense",
    'Tschigorin-Verteidigung': "Chigorin Defense",
    'Albins Gegengambit': "Albin Countergambit",
    'Londoner System': "London System",
    'Londoner System': "London System",
    'Londoner System': "London System",
    'Jobava-London': "Jobava London",
    'Colle-System': "Colle System",
    'Trompowsky-Angriff': "Trompowsky Attack",
    'Indische Verteidigung': "Indian Defense",
    'Katalanische Eröffnung': "Catalan Opening",
    'Königsindische Verteidigung': "King's Indian Defense",
    'Königsindisch: Klassisch': "King's Indian: Classical",
    'Königsindisch: Sämisch': "King's Indian: Sämisch",
    'Grünfeld-Indisch': "Grünfeld Defense",
    'Nimzowitsch-Indisch': "Nimzo-Indian Defense",
    'Damenindisch': "Queen's Indian Defense",
    'Bogoljubow-Indisch': "Bogo-Indian Defense",
    'Moderne Benoni': "Modern Benoni",
    'Benko-Gambit': "Benko Gambit",
    'Budapester Gambit': "Budapest Gambit",
    'Holländische Verteidigung': "Dutch Defense",
    'Holländisch: Leningrader System': "Dutch: Leningrad",
    'Holländisch: Stonewall': "Dutch: Stonewall",
    'Englisch: Symmetrievariante': "English: Symmetrical",
    'Englisch: Umgekehrtes Sizilianisch': "English: Reversed Sicilian",
    'Englisch: Vierspringervariante': "English: Four Knights",
    'Englisch: Anglo-Indisch': "English: Anglo-Indian",
    'Réti: Königsindischer Angriff': "Réti: King's Indian Attack"
  };
  function display(name) {
    if (!name) return name;
    var l = root.SK.i18n && root.SK.i18n.lang ? root.SK.i18n.lang() : 'de';
    if (LEGACY[name]) return l === 'en' ? LEGACY[name] : name;
    return l === 'en' ? name : deName(name);
  }

  // Kurzname relativ zu einem Oberbegriff: "Sizilianisch: Najdorf, Amsterdam" unter "Sizilianisch: Najdorf" → "Amsterdam"
  function shortName(name, parent) {
    if (!name) return '';
    if (parent && name.indexOf(parent + ', ') === 0) return name.slice(parent.length + 2);
    var p = name.split(': ');
    return p.length > 1 ? p[1] : p[0];
  }

  root.SK.book = { shortName: shortName, build: build, lookup: lookup, nameFor: nameFor, infoFor: infoFor, continuations: continuations,
                   display: display, deName: deName, size: function () { init(); return entries.length; } };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.book;
