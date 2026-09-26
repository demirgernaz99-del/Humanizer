/* Erzeugt src/openings-db.js aus tools/data/openings/*.tsv (lichess-org/chess-openings, CC0).
   Statt der Zugfolgen werden Stellungs-Fingerabdrücke gespeichert (32-Bit-Hash der FEN ohne Zugzähler):
   - n: Stellung → Eintrag (benannte Eröffnung)
   - b: alle Stellungen entlang der Linien (= „Theorie“)
   So muss die App beim Start nichts nachspielen.  Aufruf: node tools/openings_build.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { Chess } = require(path.join(__dirname, '..', 'src', 'vendor', 'chess.js'));

const DIR = path.join(__dirname, 'data', 'openings');
const OUT = path.join(__dirname, '..', 'src', 'openings-db.js');

function posKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }
// FNV-1a, 32 Bit – dieselbe Funktion steht in src/openings.js
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const rows = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = fs.readFileSync(path.join(DIR, f + '.tsv'), 'utf8').split('\n').slice(1).filter(Boolean);
  for (const l of lines) {
    const [eco, name, pgn] = l.split('\t');
    rows.push({ eco, name, sans: pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t)) });
  }
}

const fams = [], famIdx = new Map();
const entries = [], named = new Map(), book = new Map(); // book: Stellung → Anzahl Linien, die hindurchführen
let bad = 0;
rows.forEach((r) => {
  const c = new Chess();
  let ok = true;
  for (const san of r.sans) {
    try { c.move(san); } catch (e) { ok = false; break; }
    const hk = hash(posKey(c.fen()));
    book.set(hk, (book.get(hk) || 0) + 1);
  }
  if (!ok) { bad++; console.warn('Ungültige Zeile:', r.eco, r.name); return; }
  const cut = r.name.indexOf(': ');
  const fam = cut < 0 ? r.name : r.name.slice(0, cut), variation = cut < 0 ? '' : r.name.slice(cut + 2);
  if (!famIdx.has(fam)) { famIdx.set(fam, fams.length); fams.push(fam); }
  const idx = entries.length;
  entries.push([r.eco, famIdx.get(fam), variation.replace(/[|\n]/g, ' '), r.sans.length].join('|'));
  const k = hash(posKey(c.fen()));
  const prev = named.get(k);
  // Dieselbe Stellung über mehrere Zugfolgen: der Name mit der kürzesten Linie gewinnt
  if (prev == null || r.sans.length < +entries[prev].split('|')[3]) named.set(k, idx);
});

const out = '/* Automatisch erzeugt von tools/openings_build.js aus lichess-org/chess-openings (CC0). Nicht von Hand ändern.\n' +
  '   ' + entries.length + ' Eröffnungen, ' + book.size + ' Theorie-Stellungen. */\n' +
  '(function(){var r=typeof window!==\'undefined\'?window:globalThis;r.SK=r.SK||{};r.SK.openingsDb={\n' +
  'fam:' + JSON.stringify(fams) + ',\n' +
  'e:' + JSON.stringify(entries.join('\n')) + ',\n' +
  'n:' + JSON.stringify([...named].map(([k, v]) => k + ':' + v.toString(36)).join(',')) + ',\n' +
  // b: Stellung oder Stellung.Anzahl (Anzahl > 1) – die Anzahl dient als Maß für „Hauptzug“
  'b:' + JSON.stringify([...book].map(([k, n]) => n > 1 ? k + '.' + n.toString(36) : k).join(',')) + '\n};})();\n';
fs.writeFileSync(OUT, out);
console.log('OK: ' + path.relative(process.cwd(), OUT) + ' – ' + entries.length + ' Eröffnungen, ' + named.size + ' benannte Stellungen, ' +
  book.size + ' Theorie-Stellungen, ' + (out.length / 1024).toFixed(0) + ' KB' + (bad ? ', ' + bad + ' ungültig' : ''));
