/* SK.book – kleines Eröffnungsbuch: Namen gängiger Eröffnungen und „Theorie“-Züge.
   Jede Zeile ist ein Pfad in SAN; alle Zwischenstellungen gelten als Theorie.
   Erkennung über die Stellung (FEN ohne Zugzähler), also auch bei Zugumstellung. */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.SK = root.SK || {};

  var LINES = [
    ['Königsbauernspiel', 'e4'],
    ['Damenbauernspiel', 'd4'],
    ['Englische Eröffnung', 'c4'],
    ['Réti-Eröffnung', 'Nf3'],
    ['Bird-Eröffnung', 'f4'],
    ['Larsen-Eröffnung', 'b3'],
    ['Sizilianische Verteidigung', 'e4 c5'],
    ['Sizilianisch: Offene Variante', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3'],
    ['Sizilianisch: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
    ['Sizilianisch: Drachen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
    ['Sizilianisch: Klassisch', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
    ['Sizilianisch: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
    ['Sizilianisch: Sweschnikow', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
    ['Sizilianisch: Taimanow', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
    ['Sizilianisch: Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
    ['Sizilianisch: Beschleunigter Drachen', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
    ['Sizilianisch: Alapin', 'e4 c5 c3'],
    ['Sizilianisch: Smith-Morra-Gambit', 'e4 c5 d4 cxd4 c3'],
    ['Sizilianisch: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5'],
    ['Sizilianisch: Moskauer Variante', 'e4 c5 Nf3 d6 Bb5+'],
    ['Sizilianisch: Geschlossen', 'e4 c5 Nc3'],
    ['Sizilianisch: Grand-Prix-Angriff', 'e4 c5 Nc3 Nc6 f4'],
    ['Französische Verteidigung', 'e4 e6'],
    ['Französisch', 'e4 e6 d4 d5'],
    ['Französisch: Vorstoßvariante', 'e4 e6 d4 d5 e5'],
    ['Französisch: Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
    ['Französisch: Klassisch', 'e4 e6 d4 d5 Nc3 Nf6'],
    ['Französisch: Rubinstein', 'e4 e6 d4 d5 Nc3 dxe4'],
    ['Französisch: Tarrasch', 'e4 e6 d4 d5 Nd2'],
    ['Französisch: Abtauschvariante', 'e4 e6 d4 d5 exd5 exd5'],
    ['Caro-Kann-Verteidigung', 'e4 c6'],
    ['Caro-Kann', 'e4 c6 d4 d5'],
    ['Caro-Kann: Vorstoßvariante', 'e4 c6 d4 d5 e5'],
    ['Caro-Kann: Klassisch', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
    ['Caro-Kann: Abtauschvariante', 'e4 c6 d4 d5 exd5 cxd5'],
    ['Caro-Kann: Panow-Angriff', 'e4 c6 d4 d5 exd5 cxd5 c4'],
    ['Caro-Kann: Zweispringervariante', 'e4 c6 Nc3 d5 Nf3'],
    ['Skandinavische Verteidigung', 'e4 d5'],
    ['Skandinavisch: Hauptvariante', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
    ['Pirc-Verteidigung', 'e4 d6 d4 Nf6 Nc3 g6'],
    ['Pirc: Österreichischer Angriff', 'e4 d6 d4 Nf6 Nc3 g6 f4'],
    ['Moderne Verteidigung', 'e4 g6'],
    ['Aljechin-Verteidigung', 'e4 Nf6'],
    ['Owen-Verteidigung', 'e4 b6'],
    ['Nimzowitsch-Verteidigung', 'e4 Nc6'],
    ['Offene Spiele', 'e4 e5'],
    ['Königsspringerspiel', 'e4 e5 Nf3'],
    ['Parham-Angriff', 'e4 e5 Qh5'],
    ['Italienische Partie', 'e4 e5 Nf3 Nc6 Bc4'],
    ['Italienisch: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
    ['Italienisch: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3'],
    ['Italienisch: Hauptvariante', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3'],
    ['Evans-Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
    ['Zweispringerspiel im Nachzuge', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
    ['Zweispringerspiel: Springerangriff', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5'],
    ['Zweispringerspiel: Fegatello (Fried Liver)', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
    ['Zweispringerspiel: Traxler', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5'],
    ['Ungarische Verteidigung', 'e4 e5 Nf3 Nc6 Bc4 Be7'],
    ['Spanische Partie', 'e4 e5 Nf3 Nc6 Bb5'],
    ['Spanisch: Morphy-Verteidigung', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4'],
    ['Spanisch: Geschlossen', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'],
    ['Spanisch: Marshall-Angriff', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5'],
    ['Spanisch: Offen', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4'],
    ['Spanisch: Berliner Verteidigung', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
    ['Spanisch: Berliner Mauer', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8'],
    ['Spanisch: Abtauschvariante', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
    ['Schottische Partie', 'e4 e5 Nf3 Nc6 d4'],
    ['Schottisch: Hauptvariante', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
    ['Schottisches Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4'],
    ['Dreispringerspiel', 'e4 e5 Nf3 Nc6 Nc3'],
    ['Vierspringerspiel', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
    ['Ponziani-Eröffnung', 'e4 e5 Nf3 Nc6 c3'],
    ['Russische Verteidigung (Petroff)', 'e4 e5 Nf3 Nf6'],
    ['Philidor-Verteidigung', 'e4 e5 Nf3 d6'],
    ['Lettisches Gambit', 'e4 e5 Nf3 f5'],
    ['Königsgambit', 'e4 e5 f4'],
    ['Königsgambit angenommen', 'e4 e5 f4 exf4'],
    ['Wiener Partie', 'e4 e5 Nc3'],
    ['Läuferspiel', 'e4 e5 Bc4'],
    ['Mittelgambit', 'e4 e5 d4 exd4'],
    ['Damengambit', 'd4 d5 c4'],
    ['Damengambit angenommen', 'd4 d5 c4 dxc4'],
    ['Damengambit abgelehnt', 'd4 d5 c4 e6'],
    ['Damengambit: Orthodoxe Verteidigung', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7'],
    ['Damengambit: Abtauschvariante', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5'],
    ['Tarrasch-Verteidigung', 'd4 d5 c4 e6 Nc3 c5'],
    ['Slawische Verteidigung', 'd4 d5 c4 c6'],
    ['Slawisch: Abtauschvariante', 'd4 d5 c4 c6 cxd5 cxd5'],
    ['Halbslawisch', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
    ['Tschigorin-Verteidigung', 'd4 d5 c4 Nc6'],
    ['Albins Gegengambit', 'd4 d5 c4 e5'],
    ['Londoner System', 'd4 d5 Bf4'],
    ['Londoner System', 'd4 Nf6 Bf4'],
    ['Londoner System', 'd4 d5 Nf3 Nf6 Bf4'],
    ['Jobava-London', 'd4 d5 Nc3 Nf6 Bf4'],
    ['Colle-System', 'd4 d5 Nf3 Nf6 e3'],
    ['Trompowsky-Angriff', 'd4 Nf6 Bg5'],
    ['Indische Verteidigung', 'd4 Nf6'],
    ['Katalanische Eröffnung', 'd4 Nf6 c4 e6 g3'],
    ['Königsindische Verteidigung', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6'],
    ['Königsindisch: Klassisch', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'],
    ['Königsindisch: Sämisch', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3'],
    ['Grünfeld-Indisch', 'd4 Nf6 c4 g6 Nc3 d5'],
    ['Nimzowitsch-Indisch', 'd4 Nf6 c4 e6 Nc3 Bb4'],
    ['Damenindisch', 'd4 Nf6 c4 e6 Nf3 b6'],
    ['Bogoljubow-Indisch', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
    ['Moderne Benoni', 'd4 Nf6 c4 c5 d5 e6'],
    ['Benko-Gambit', 'd4 Nf6 c4 c5 d5 b5'],
    ['Budapester Gambit', 'd4 Nf6 c4 e5'],
    ['Holländische Verteidigung', 'd4 f5'],
    ['Holländisch: Leningrader System', 'd4 f5 c4 Nf6 g3 g6'],
    ['Holländisch: Stonewall', 'd4 f5 c4 Nf6 g3 e6 Bg2 d5'],
    ['Englisch: Symmetrievariante', 'c4 c5'],
    ['Englisch: Umgekehrtes Sizilianisch', 'c4 e5'],
    ['Englisch: Vierspringervariante', 'c4 e5 Nc3 Nf6 Nf3 Nc6'],
    ['Englisch: Anglo-Indisch', 'c4 Nf6'],
    ['Réti: Königsindischer Angriff', 'Nf3 d5 g3']
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
        if (last) m.set(k, { name: row[0] });
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

  // Name der Eröffnung entlang einer Folge von Stellungen (letzte benannte Stellung)
  function nameFor(fens) {
    var name = null;
    for (var i = 0; i < fens.length; i++) {
      var e = lookup(fens[i]);
      if (!e) { if (i > 0) break; else continue; }
      if (e.name) name = e.name;
    }
    return name;
  }

  root.SK.book = { LINES: LINES, build: build, lookup: lookup, nameFor: nameFor };
})();
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SK.book;
