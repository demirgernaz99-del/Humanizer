# Eröffnungsdaten

`a.tsv` … `e.tsv` stammen aus <https://github.com/lichess-org/chess-openings> (Stand September 2026).
Lizenz: gemeinfrei bzw. CC0 1.0 (siehe README des Projekts) – kommerzielle Nutzung erlaubt.

Daraus erzeugt `node tools/openings_build.js` die kompakte Datei `src/openings-db.js`
(Stellungs-Fingerabdrücke statt Zugfolgen, damit die App schnell startet).
