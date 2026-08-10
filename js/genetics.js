// Gemeinsame Farbgenetik-Hilfsfunktionen für verpaarung.js (Punnett-
// Schätzung) und sortierhilfe.js (Sonderfarben-Vererbungs-Check). Arbeitet
// auf dem "Tested Colours"-Text (z.B. "Ee AA gg SW1n W21n").

// Zerlegt ein Token in zwei Allele, best-effort:
// - "Ee", "AA", "gg" (2 Buchstaben) -> je 1 Buchstabe pro Allel (Basisgene:
//   Extension/Agouti/Grey usw.)
// - "SW1n", "W21n", "CRn" (Code + "n") -> [Code, "n"] (heterozygoter
//   Träger einer Sonderfarbe/Musterung)
// - "SW1SW1" (Code doppelt) -> [Code, Code] (homozygot)
// Nicht erkennbare Tokens liefern null (übersprungen, kein Fehler).
function parseGenotypeToken(token) {
  if (/^[A-Za-z]{2}$/.test(token)) {
    return [token[0], token[1]];
  }
  const mHet = token.match(/^([A-Za-z]+\d*)n$/);
  if (mHet) {
    return [mHet[1], 'n'];
  }
  const half = token.length / 2;
  if (Number.isInteger(half) && half > 0 && token.slice(0, half) === token.slice(half)) {
    return [token.slice(0, half), token.slice(half)];
  }
  return null;
}

function tokenizeColours(coloursText) {
  const map = new Map();
  if (!coloursText) return map;
  coloursText.trim().split(/\s+/).forEach((token) => {
    const alleles = parseGenotypeToken(token);
    if (alleles) map.set(token, alleles);
  });
  return map;
}

// Die "Code-Wurzel" eines Genorts (Allel ohne "n"), damit z.B. "SW1n" und
// "SW1SW1" trotz unterschiedlicher Schreibweise als derselbe Genort gelten.
function codeOfAlleles(alleles) {
  return alleles.find((a) => a !== 'n') || alleles[0];
}

// Basisgene (Extension/Agouti/Grey usw.) werden als 1-Buchstaben-Code
// dargestellt ("E", "A", "g"), Sonderfarben/Musterungen (Splash White,
// Cream, Champagne, Tobiano, Leopard-Komplex...) als mehrstelliger Code
// ("SW1", "CR", "TO", "LP") - siehe parseGenotypeToken. Rein längenbasierte
// Unterscheidung, best effort.
function isSpecialColorCode(code) {
  return code.length > 1;
}

// Prüft, wie viele der (aktiv getragenen) Sonderfarben-Gene eines
// Elternteils NICHT an dieses Pferd weitergegeben wurden - z.B. Vater
// trägt SW1 aktiv, Fohlen hat kein SW1 -> "verloren". Nur Genorte, die ein
// Elternteil selbst aktiv trägt (mind. 1 Kopie, nicht "n/n"), zählen mit -
// ein Elternteil, das selbst gar keine Kopie trägt, kann nichts vererben.
// horsesByHrId muss tested_colours enthalten (siehe js/pedigree.js).
function computeSpecialTraitLoss(horse, horsesByHrId) {
  const sire = horse.sire_hr_id ? horsesByHrId.get(horse.sire_hr_id) : null;
  const dam = horse.dam_hr_id ? horsesByHrId.get(horse.dam_hr_id) : null;
  if (!sire && !dam) return null;

  const ownLoci = tokenizeColours(horse.tested_colours);
  const ownByCode = new Map([...ownLoci.values()].map((alleles) => [codeOfAlleles(alleles), alleles]));

  let lost = 0;
  let checked = 0;
  const lostCodes = [];
  [sire, dam].filter(Boolean).forEach((parent) => {
    const parentLoci = tokenizeColours(parent.tested_colours);
    parentLoci.forEach((alleles) => {
      const code = codeOfAlleles(alleles);
      if (!isSpecialColorCode(code)) return;
      if (!alleles.includes(code)) return; // Elternteil trägt selbst keine aktive Kopie
      checked++;
      const ownAlleles = ownByCode.get(code);
      if (!ownAlleles || !ownAlleles.includes(code)) {
        lost++;
        lostCodes.push(code);
      }
    });
  });

  if (checked === 0) return null;
  return { lost, checked, lostCodes, lossRatio: lost / checked };
}

// --- Kompakter Gencode aus Tested Colours - für automatisch generierte
// Namen (z.B. bei noch unbenannten "Foal Doe"-Pferden), exakt nach dem
// Muster, das die Nutzerin selbst für ihre eigenen Pferdenamen verwendet
// (z.B. "554 EA²SW1W21" aus "Ee AA gg SW1n W21n", "A 536 ELp" aus...):
// je Genort nur der positive/dominante Code, "²" bei Homozygotie,
// rein rezessive/negative Genorte (ee, aa, gg, n/n) werden weggelassen.
// Verifiziert gegen ein echtes Pferd der Nutzerin (554): Ergebnis stimmt
// exakt mit dem tatsächlichen Namen überein.
function toCompactGeneCode(testedColours) {
  if (!testedColours) return '';
  const tokens = testedColours.trim().split(/\s+/);
  const parts = [];
  tokens.forEach((tok) => {
    // 2-Buchstaben-Basisgen (Groß/Klein unterscheidet dominant/rezessiv): Ee/EE/ee
    if (/^[A-Za-z]{2}$/.test(tok) && tok[0].toLowerCase() === tok[1].toLowerCase()) {
      const isUpper1 = tok[0] === tok[0].toUpperCase();
      const isUpper2 = tok[1] === tok[1].toUpperCase();
      if (!isUpper1 && !isUpper2) return; // homozygot rezessiv (z.B. "ee") -> weglassen
      parts.push(tok[0].toUpperCase() + (isUpper1 && isUpper2 ? '²' : ''));
      return;
    }
    // "Coden" (heterozygoter Träger, z.B. "SW1n")
    const mHet = tok.match(/^([A-Za-z]+\d*)n$/);
    if (mHet) { parts.push(mHet[1]); return; }
    // "CodeCode" (homozygot, z.B. "SW1SW1")
    const half = tok.length / 2;
    if (Number.isInteger(half) && half > 0 && tok.slice(0, half) === tok.slice(half)) {
      parts.push(tok.slice(0, half) + '²');
    }
    // "n" bzw. "n/n" allein (komplett negativ) -> weglassen, kein weiterer Fall nötig
  });
  return parts.join('');
}

// --- Vererbungs-Hinweise für die optischen Merkmale (Pangaré/Sooty/Flaxen/
// Sabino) anhand der Eltern - siehe reference/wiki-research.md. Die vier
// Merkmale verhalten sich genetisch NICHT gleich, daher unterschiedliche
// Sicherheit der Aussage:
// - Flaxen und (Hidden) Sabino sind einfach rezessiv und ungetestet: zeigt
//   ein Elternteil das Merkmal sichtbar, ist es garantiert reinerbig dafür
//   und gibt daher garantiert mindestens eine Kopie weiter -> das Fohlen
//   ist dann mindestens Träger ("stark").
// - Sooty hat je nach Rasse/Basisfarbe wechselnde Dominanz (laut Horse-
//   Reality-Wiki auf Bay-Basis oft dominant, auf Chestnut-Basis oft
//   rezessiv) - keine sichere Ableitung möglich, nur ein schwacher Hinweis.
// - Pangaré ist dominant: ein sichtbares Elternteil kann heterozygot sein
//   und die Anlage nur zu 50% weitergeben - ebenfalls nur ein schwacher
//   Hinweis, keine Garantie.
const OPTICAL_TRAIT_INHERITANCE = {
  flaxen: { level: 'strong', reason: 'rezessiv, Elternteil zeigt es nur reinerbig' },
  sabino: { level: 'strong', reason: 'rezessiv, Elternteil zeigt es nur reinerbig' },
  sooty: { level: 'weak', reason: 'Dominanz je nach Rasse/Basisfarbe unterschiedlich, nicht sicher ableitbar' },
  pangare: { level: 'weak', reason: 'dominant, Elternteil könnte nur heterozygot sein (50% Chance)' },
};

// horsesByHrId muss pangare/sooty/flaxen/sabino enthalten (siehe
// js/pedigree.js HORSE_LIGHT_COLUMNS). Gibt null zurück, wenn das Merkmal
// bei diesem Pferd schon manuell gesetzt ist (kein Hinweis nötig) oder
// keines der bekannten Elternteile das Merkmal sichtbar zeigt.
function inferOpticalTraitHint(horse, trait, horsesByHrId) {
  if (horse[trait] === 'ja' || horse[trait] === 'nein') return null;

  const sire = horse.sire_hr_id ? horsesByHrId.get(horse.sire_hr_id) : null;
  const dam = horse.dam_hr_id ? horsesByHrId.get(horse.dam_hr_id) : null;
  const showingParent = [sire, dam].find((p) => p && p[trait] === 'ja');
  if (!showingParent) return null;

  const info = OPTICAL_TRAIT_INHERITANCE[trait];
  const text = info.level === 'strong'
    ? `mind. Träger (${showingParent.name} zeigt es, ${info.reason})`
    : `möglich (${showingParent.name} zeigt es, ${info.reason})`;
  return { level: info.level, text };
}
