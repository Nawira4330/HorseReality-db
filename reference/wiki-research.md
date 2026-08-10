# Recherche: Horse Reality Wiki + Forum (2026-07-29)

Offizielle Quelle: [horsereality.wiki](https://horsereality.wiki) (Colour Genetics Guide,
Modifiers, White Patterns). Community-Quelle: Forum-Thread ["Collection Thread for Coat
Colour Resources"](https://www.horsereality.com/forum/topic_120113/collection-thread-for-coat-colour-resources)
von Mayflower38 - Sammlung dutzender rassespezifischer Community-Farbguides.

## Pangaré (dominant!)
- Nur auf **Chestnut- und Bay-Basis** sichtbar (hellt Weichteile auf: Bauch, Flanken,
  Maul, Augenumgebung).
- **Dominantes** PA-Allel (PA/pa ODER PA/PA zeigen beide Pangaré). Ungetestet.
- Genotypen: `E/_+A/_+PA/_` = Bay Pangaré, `e/e+PA/_` = Chestnut Pangaré.
- **Wichtig für Vererbungs-Logik:** Ein Elternteil, das Pangaré zeigt, könnte
  heterozygot (PA/pa) sein - dann nur 50% Chance, die Anlage überhaupt weiterzugeben.
  KEINE Garantie, dass das Fohlen mind. Träger ist (anders als bei rezessiven Genen).
- Wiki: [Pangaré](https://horsereality.wiki/en/colour-genetics/modifiers/pangare)

## Sooty (Dominanz uneinheitlich!)
- Dunkelt Chestnut- und Bay-Basis ab (Chestnut: oft nur Beine/Unterkörper bis hin zu
  "Liver Chestnut"/"Chocolate Palomino"; Bay: oft Rücken/Oberkörper, wirkt wie Dun-Strich).
- **Nicht bei Fohlen erkennbar** - Sooty-Färbung erscheint erst beim Erwachsenwerden (3 Jahre).
- **Dominanz ist rassen- UND basisfarben-abhängig**: "Sooty may be a dominant trait on
  bay bases, for example, while being recessive on chestnut bases" (offizielles Wiki-Zitat).
  Bestätigt auch durch Community-Spreadsheet-Notiz: "Sooty only requires one copy to
  appear on bays, but requires two copies to display on chestnuts."
- **Wichtig für Vererbungs-Logik:** KEINE pauschale "Elternteil zeigt es → Fohlen ist
  Träger"-Garantie möglich, da nicht einheitlich rezessiv. Nur als schwacher Hinweis
  behandeln, nicht als sichere Ableitung.
- Wiki: [Sooty](https://horsereality.wiki/en/colour-genetics/modifiers/sooty)

## Flaxen (einfach rezessiv)
- Nur auf **Chestnut-Basis** (e/e), hellt Mähne/Schweif/Fesselbehang auf.
- Einfach **rezessiv**: `e/e + f/f` = Flaxen Chestnut, `e/e + F/f` oder `F/F` = normal
  Chestnut (nicht sichtbar). Ungetestet.
- **Bei Fohlen bereits erkennbar** (anders als Sooty).
- **Sicher für Vererbungs-Logik:** Elternteil zeigt Flaxen (= garantiert f/f) → Fohlen
  erhält garantiert mind. 1 Kopie f → mind. Träger.
- Wiki: [Flaxen](https://horsereality.wiki/en/colour-genetics/modifiers/flaxen)

## Hidden Sabino (einfach rezessiv, = das "Sabino" aus der ursprünglichen Anfrage)
- Sammelbegriff für ungetestete sabino-artige Musterungen (nicht zu verwechseln mit dem
  GETESTETEN Sabino1/SB1 auf dem KIT-Gen, das im Labor testbar und unvollständig
  dominant ist - siehe unten). Jede Basisfarbe betroffen, Ausprägung variiert stark
  zwischen Rassen.
- Einfach **rezessiv**, 2 Kopien nötig, ungetestet, rasse-eigene Ausprägung.
- **Sicher für Vererbungs-Logik:** wie Flaxen - Elternteil zeigt es → Fohlen mind. Träger.
- Wiki: [Hidden Sabino](https://horsereality.wiki/en/colour-genetics/white-patterns/hidden-sabino)

## Sabino1 (zum Vergleich, ist eigentlich TESTBAR - nicht das "Sabino" aus der Anfrage)
- Unvollständig dominantes SB1-Allel auf dem KIT-Gen (gleicher Genort wie Tobiano/Roan/
  White-Spotting - daher nur heterozygote Kombinationen wie SB1/TO möglich).
  **Kann im Labor getestet werden** - taucht dann vermutlich in Tested Colours auf, nicht
  in den optischen Merkmalen.
- Wiki: [Sabino1](https://horsereality.wiki/en/colour-genetics/white-patterns/sabino-1)

## Sonstige Funde
- Forum-Thread "Collection Thread for Coat Colour Resources" listet pro Rasse mehrere
  Community-Farbguides (Google Sheets/Docs) - z.B. für Icelandic Horse (ihre Hauptrasse)
  mehrere Guides vorhanden. Nicht einzeln gespeichert (zu viele, meist Bildergalerien wie
  die bereits bekannten Spreadsheets), aber bei Bedarf über den Thread auffindbar.
- Genotyp→Phänotyp-Namenstabellen gefunden (z.B. Leopard-Komplex-Muster wie "Fewspot",
  "Snowcap", "Varnish" mit zugehöriger LP/PATN-Genotyp-Notation) - nützlich für spätere
  automatische Farbnamen-Ableitung aus Tested Colours.
- Ankündigung: Icelandic-Horse-Grafik-Überarbeitung am 17. Feb (neues W8-Gen, mehr
  Sooty-Pangaré-Kombinationen) - macht evtl. gesammelte Icelandic-Referenzbilder danach
  teilweise veraltet.

## Konsequenz für die App
Die Vererbungs-Ableitung (Eltern → Fohlen) MUSS pro Merkmal unterschiedlich behandelt
werden, nicht einheitlich:
- **Flaxen, Sabino** (Hidden Sabino): rezessiv, ungetestet → "Elternteil zeigt es" ist ein
  starker, sicherer Hinweis ("mind. Träger garantiert").
- **Sooty**: uneinheitliche Dominanz → nur schwacher Hinweis ("könnte Träger sein, nicht
  sicher - Dominanz ist rassen-/basisfarbenabhängig").
- **Pangaré**: dominant → Elternteil zeigt es ist KEINE Garantie fürs Fohlen (nur 50%
  Chance bei heterozygotem Elternteil) - eigener, schwächerer Hinweistext.
