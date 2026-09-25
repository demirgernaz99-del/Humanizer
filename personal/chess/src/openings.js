/* SK.book – kleines Eröffnungsbuch: Namen gängiger Eröffnungen und „Theorie“-Züge.
   Jede Zeile ist ein Pfad in SAN; alle Zwischenstellungen gelten als Theorie.
   Erkennung über die Stellung (FEN ohne Zugzähler), also auch bei Zugumstellung. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var LINES = [
    ['Königsbauernspiel', 'e4', "King's Pawn Opening"],
    ['Damenbauernspiel', 'd4', "Queen's Pawn Opening"],
    ['Englische Eröffnung', 'c4', "English Opening"],
    ['Réti-Eröffnung', 'Nf3', "Réti Opening"],
    ['Bird-Eröffnung', 'f4', "Bird's Opening"],
    ['Larsen-Eröffnung', 'b3', "Larsen's Opening"],
    ['Sizilianische Verteidigung', 'e4 c5', "Sicilian Defense"],
    ['Sizilianisch: Offene Variante', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', "Sicilian: Open"],
    ['Sizilianisch: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', "Sicilian: Najdorf"],
    ['Sizilianisch: Drachen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', "Sicilian: Dragon"],
    ['Sizilianisch: Klassisch', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', "Sicilian: Classical"],
    ['Sizilianisch: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', "Sicilian: Scheveningen"],
    ['Sizilianisch: Sweschnikow', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5', "Sicilian: Sveshnikov"],
    ['Sizilianisch: Taimanow', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6', "Sicilian: Taimanov"],
    ['Sizilianisch: Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6', "Sicilian: Kan"],
    ['Sizilianisch: Beschleunigter Drachen', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6', "Sicilian: Accelerated Dragon"],
    ['Sizilianisch: Alapin', 'e4 c5 c3', "Sicilian: Alapin"],
    ['Sizilianisch: Smith-Morra-Gambit', 'e4 c5 d4 cxd4 c3', "Sicilian: Smith-Morra Gambit"],
    ['Sizilianisch: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5', "Sicilian: Rossolimo"],
    ['Sizilianisch: Moskauer Variante', 'e4 c5 Nf3 d6 Bb5+', "Sicilian: Moscow Variation"],
    ['Sizilianisch: Geschlossen', 'e4 c5 Nc3', "Sicilian: Closed"],
    ['Sizilianisch: Grand-Prix-Angriff', 'e4 c5 Nc3 Nc6 f4', "Sicilian: Grand Prix Attack"],
    ['Französische Verteidigung', 'e4 e6', "French Defense"],
    ['Französisch', 'e4 e6 d4 d5', "French Defense"],
    ['Französisch: Vorstoßvariante', 'e4 e6 d4 d5 e5', "French: Advance"],
    ['Französisch: Winawer', 'e4 e6 d4 d5 Nc3 Bb4', "French: Winawer"],
    ['Französisch: Klassisch', 'e4 e6 d4 d5 Nc3 Nf6', "French: Classical"],
    ['Französisch: Rubinstein', 'e4 e6 d4 d5 Nc3 dxe4', "French: Rubinstein"],
    ['Französisch: Tarrasch', 'e4 e6 d4 d5 Nd2', "French: Tarrasch"],
    ['Französisch: Abtauschvariante', 'e4 e6 d4 d5 exd5 exd5', "French: Exchange"],
    ['Caro-Kann-Verteidigung', 'e4 c6', "Caro-Kann Defense"],
    ['Caro-Kann', 'e4 c6 d4 d5', "Caro-Kann Defense"],
    ['Caro-Kann: Vorstoßvariante', 'e4 c6 d4 d5 e5', "Caro-Kann: Advance"],
    ['Caro-Kann: Klassisch', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', "Caro-Kann: Classical"],
    ['Caro-Kann: Abtauschvariante', 'e4 c6 d4 d5 exd5 cxd5', "Caro-Kann: Exchange"],
    ['Caro-Kann: Panow-Angriff', 'e4 c6 d4 d5 exd5 cxd5 c4', "Caro-Kann: Panov Attack"],
    ['Caro-Kann: Zweispringervariante', 'e4 c6 Nc3 d5 Nf3', "Caro-Kann: Two Knights"],
    ['Skandinavische Verteidigung', 'e4 d5', "Scandinavian Defense"],
    ['Skandinavisch: Hauptvariante', 'e4 d5 exd5 Qxd5 Nc3 Qa5', "Scandinavian: Main Line"],
    ['Pirc-Verteidigung', 'e4 d6 d4 Nf6 Nc3 g6', "Pirc Defense"],
    ['Pirc: Österreichischer Angriff', 'e4 d6 d4 Nf6 Nc3 g6 f4', "Pirc: Austrian Attack"],
    ['Moderne Verteidigung', 'e4 g6', "Modern Defense"],
    ['Aljechin-Verteidigung', 'e4 Nf6', "Alekhine's Defense"],
    ['Owen-Verteidigung', 'e4 b6', "Owen's Defense"],
    ['Nimzowitsch-Verteidigung', 'e4 Nc6', "Nimzowitsch Defense"],
    ['Offene Spiele', 'e4 e5', "King's Pawn Game"],
    ['Königsspringerspiel', 'e4 e5 Nf3', "King's Knight Opening"],
    ['Parham-Angriff', 'e4 e5 Qh5', "Parham Attack"],
    ['Italienische Partie', 'e4 e5 Nf3 Nc6 Bc4', "Italian Game"],
    ['Italienisch: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5', "Italian: Giuoco Piano"],
    ['Italienisch: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3', "Italian: Giuoco Pianissimo"],
    ['Italienisch: Hauptvariante', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', "Italian: Main Line"],
    ['Evans-Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', "Evans Gambit"],
    ['Zweispringerspiel im Nachzuge', 'e4 e5 Nf3 Nc6 Bc4 Nf6', "Two Knights Defense"],
    ['Zweispringerspiel: Springerangriff', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', "Two Knights: Knight Attack"],
    ['Zweispringerspiel: Fegatello (Fried Liver)', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7', "Two Knights: Fried Liver Attack"],
    ['Zweispringerspiel: Traxler', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5', "Two Knights: Traxler"],
    ['Ungarische Verteidigung', 'e4 e5 Nf3 Nc6 Bc4 Be7', "Hungarian Defense"],
    ['Spanische Partie', 'e4 e5 Nf3 Nc6 Bb5', "Ruy Lopez"],
    ['Spanisch: Morphy-Verteidigung', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4', "Ruy Lopez: Morphy Defense"],
    ['Spanisch: Geschlossen', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O', "Ruy Lopez: Closed"],
    ['Spanisch: Marshall-Angriff', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5', "Ruy Lopez: Marshall Attack"],
    ['Spanisch: Offen', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4', "Ruy Lopez: Open"],
    ['Spanisch: Berliner Verteidigung', 'e4 e5 Nf3 Nc6 Bb5 Nf6', "Ruy Lopez: Berlin Defense"],
    ['Spanisch: Berliner Mauer', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8', "Ruy Lopez: Berlin Wall"],
    ['Spanisch: Abtauschvariante', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6', "Ruy Lopez: Exchange"],
    ['Schottische Partie', 'e4 e5 Nf3 Nc6 d4', "Scotch Game"],
    ['Schottisch: Hauptvariante', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', "Scotch: Main Line"],
    ['Schottisches Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4', "Scotch Gambit"],
    ['Dreispringerspiel', 'e4 e5 Nf3 Nc6 Nc3', "Three Knights Game"],
    ['Vierspringerspiel', 'e4 e5 Nf3 Nc6 Nc3 Nf6', "Four Knights Game"],
    ['Ponziani-Eröffnung', 'e4 e5 Nf3 Nc6 c3', "Ponziani Opening"],
    ['Russische Verteidigung (Petroff)', 'e4 e5 Nf3 Nf6', "Petrov Defense"],
    ['Philidor-Verteidigung', 'e4 e5 Nf3 d6', "Philidor Defense"],
    ['Lettisches Gambit', 'e4 e5 Nf3 f5', "Latvian Gambit"],
    ['Königsgambit', 'e4 e5 f4', "King's Gambit"],
    ['Königsgambit angenommen', 'e4 e5 f4 exf4', "King's Gambit Accepted"],
    ['Wiener Partie', 'e4 e5 Nc3', "Vienna Game"],
    ['Läuferspiel', 'e4 e5 Bc4', "Bishop's Opening"],
    ['Mittelgambit', 'e4 e5 d4 exd4', "Center Game"],
    ['Damengambit', 'd4 d5 c4', "Queen's Gambit"],
    ['Damengambit angenommen', 'd4 d5 c4 dxc4', "Queen's Gambit Accepted"],
    ['Damengambit abgelehnt', 'd4 d5 c4 e6', "Queen's Gambit Declined"],
    ['Damengambit: Orthodoxe Verteidigung', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', "QGD: Orthodox Defense"],
    ['Damengambit: Abtauschvariante', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5', "QGD: Exchange Variation"],
    ['Tarrasch-Verteidigung', 'd4 d5 c4 e6 Nc3 c5', "Tarrasch Defense"],
    ['Slawische Verteidigung', 'd4 d5 c4 c6', "Slav Defense"],
    ['Slawisch: Abtauschvariante', 'd4 d5 c4 c6 cxd5 cxd5', "Slav: Exchange"],
    ['Halbslawisch', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6', "Semi-Slav Defense"],
    ['Tschigorin-Verteidigung', 'd4 d5 c4 Nc6', "Chigorin Defense"],
    ['Albins Gegengambit', 'd4 d5 c4 e5', "Albin Countergambit"],
    ['Londoner System', 'd4 d5 Bf4', "London System"],
    ['Londoner System', 'd4 Nf6 Bf4', "London System"],
    ['Londoner System', 'd4 d5 Nf3 Nf6 Bf4', "London System"],
    ['Jobava-London', 'd4 d5 Nc3 Nf6 Bf4', "Jobava London"],
    ['Colle-System', 'd4 d5 Nf3 Nf6 e3', "Colle System"],
    ['Trompowsky-Angriff', 'd4 Nf6 Bg5', "Trompowsky Attack"],
    ['Indische Verteidigung', 'd4 Nf6', "Indian Defense"],
    ['Katalanische Eröffnung', 'd4 Nf6 c4 e6 g3', "Catalan Opening"],
    ['Königsindische Verteidigung', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', "King's Indian Defense"],
    ['Königsindisch: Klassisch', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5', "King's Indian: Classical"],
    ['Königsindisch: Sämisch', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3', "King's Indian: Sämisch"],
    ['Grünfeld-Indisch', 'd4 Nf6 c4 g6 Nc3 d5', "Grünfeld Defense"],
    ['Nimzowitsch-Indisch', 'd4 Nf6 c4 e6 Nc3 Bb4', "Nimzo-Indian Defense"],
    ['Damenindisch', 'd4 Nf6 c4 e6 Nf3 b6', "Queen's Indian Defense"],
    ['Bogoljubow-Indisch', 'd4 Nf6 c4 e6 Nf3 Bb4+', "Bogo-Indian Defense"],
    ['Moderne Benoni', 'd4 Nf6 c4 c5 d5 e6', "Modern Benoni"],
    ['Benko-Gambit', 'd4 Nf6 c4 c5 d5 b5', "Benko Gambit"],
    ['Budapester Gambit', 'd4 Nf6 c4 e5', "Budapest Gambit"],
    ['Holländische Verteidigung', 'd4 f5', "Dutch Defense"],
    ['Holländisch: Leningrader System', 'd4 f5 c4 Nf6 g3 g6', "Dutch: Leningrad"],
    ['Holländisch: Stonewall', 'd4 f5 c4 Nf6 g3 e6 Bg2 d5', "Dutch: Stonewall"],
    ['Englisch: Symmetrievariante', 'c4 c5', "English: Symmetrical"],
    ['Englisch: Umgekehrtes Sizilianisch', 'c4 e5', "English: Reversed Sicilian"],
    ['Englisch: Vierspringervariante', 'c4 e5 Nc3 Nf6 Nf3 Nc6', "English: Four Knights"],
    ['Englisch: Anglo-Indisch', 'c4 Nf6', "English: Anglo-Indian"],
    ['Réti: Königsindischer Angriff', 'Nf3 d5 g3', "Réti: King's Indian Attack"]
  ];

  var map = null;

  function posKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }

  // Baut die Stellungstabelle; wirft bei einer ungültigen Zeile (Selbsttest fängt das).
  function build(ChessLib) {
    var L = ChessLib || root.SK.ChessLib;
    var m = new Map();
    LINES.forEach(function (row) {
      var c = new L.Chess();
      var sans = row[1].split(' ');
      sans.forEach(function (san, i) {
        c.move(san);
        var k = posKey(c.fen());
        var last = i === sans.length - 1;
        var cur = m.get(k);
        if (last) m.set(k, { name: row[0], en: row[2] || row[0] });
        else if (!cur) m.set(k, { name: null });
      });
    });
    map = m;
    return m;
  }

  function lookup(fen) {
    if (!map) build();
    return map.get(posKey(fen)) || null;
  }

  // Name der Eröffnung entlang einer Folge von Stellungen (letzte benannte Stellung).
  // Gespeichert wird der deutsche Name; die Anzeige übersetzt mit display().
  function nameFor(fens) {
    var name = null;
    for (var i = 0; i < fens.length; i++) {
      var e = lookup(fens[i]);
      if (!e) { if (i > 0) break; else continue; }
      if (e.name) name = e.name;
    }
    return name;
  }
  var EN_BY_DE = null;
  function display(name) {
    if (!name) return name;
    var l = root.SK.i18n && root.SK.i18n.lang ? root.SK.i18n.lang() : 'de';
    if (l !== 'en') return name;
    if (!EN_BY_DE) { EN_BY_DE = {}; LINES.forEach(function (r) { EN_BY_DE[r[0]] = r[2] || r[0]; }); }
    return EN_BY_DE[name] || name;
  }

  root.SK.book = { LINES: LINES, build: build, lookup: lookup, nameFor: nameFor, display: display };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.book;
