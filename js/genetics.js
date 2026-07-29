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
