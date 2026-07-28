// Parser für den kopierten Text einer Horse-Reality-Pferdeseite.
//
// Horse Reality bietet keine offizielle Export-Funktion. Anders als beim
// Schwesterprojekt MDR-Datenbank ist die Pferdeseite hier in Reiter
// aufgeteilt (Care/Info/Colour/Stats/Foals) - Strg+A auf der ganzen Seite
// erfasst deshalb nur den gerade sichtbaren Reiter. Dieser Parser ist daher
// bewusst so gebaut, dass man beliebig viele kopierte Reiter-Texte
// nacheinander in dieselbe Box einfügen kann: er sucht nach den bekannten
// Abschnittsüberschriften (z.B. "Passport", "Pedigree") irgendwo im Text und
// extrahiert nur das, was er findet. Alles wird "best effort" behandelt -
// der komplette Rohtext wird immer mit gespeichert, damit nichts verloren
// geht, falls sich das Seitenlayout im Spiel mal ändert oder der Parser
// etwas falsch erkennt.
//
// Bisher unterstützt: Info-Reiter (Passport-Block + Pedigree-Block).
// Colour/Stats/Foals folgen, sobald Beispieltexte dieser Reiter vorliegen.

// Fixe Reihenfolge, in der Horse Reality den Stammbaum-Ausschnitt aus der
// Info-Seite auflistet: erst der komplette Vater-Zweig (Vater, dann dessen
// eigener Zweig rekursiv), danach der komplette Mutter-Zweig - siehe
// buildFanOrder(). "S" = Sire (Vater-Linie), "D" = Dam (Mutter-Linie); der
// "path" eines Vorfahren (z.B. "SD") liest sich als "Vater der Mutter des
// Vaters" von hinten nach vorne, also: erstes Zeichen = direkter Elternteil
// des Pferds selbst, jedes weitere Zeichen ein Schritt weiter zurück.
function buildFanOrder(maxGeneration) {
  function walk(path, generation) {
    if (generation > maxGeneration) return [];
    const side = path[path.length - 1];
    let out = [{ path, generation, side }];
    if (generation < maxGeneration) {
      out = out.concat(walk(path + 'S', generation + 1));
      out = out.concat(walk(path + 'D', generation + 1));
    }
    return out;
  }
  return walk('S', 1).concat(walk('D', 1));
}

// Anzahl Eintraege (bekannt + "Unknown") pro Generationstiefe ist immer
// 2 * (2^g - 1) - daraus laesst sich die im Text tatsaechlich gezeigte
// Generationstiefe zurückrechnen, falls Horse Reality mal mehr oder weniger
// als die aktuell ueblichen 3 Generationen anzeigt.
function guessMaxGeneration(entryCount) {
  for (let g = 1; g <= 18; g++) {
    if (2 * (Math.pow(2, g) - 1) === entryCount) return g;
  }
  return 3;
}

function extractHrId(url) {
  const m = url && url.match(/\/horses\/(\d+)/);
  return m ? m[1] : null;
}

const LINK_LINE_RE = /^\[(.+?)\]\((https?:\/\/\S+?)\)$/;

function findLineIndex(lines, predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

// Sucht eine "Label"-Zeile (z.B. "Genetic Potential") und gibt die nächste
// nicht-leere Zeile danach als Wert zurück - Horse Reality zeigt Label und
// Wert im kopierten Text jeweils auf eigenen Zeilen.
function findLabelValue(lines, label, from = 0) {
  const idx = findLineIndex(lines, (l) => l === label, from);
  if (idx === -1) return null;
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i]) return { value: lines[i], index: i };
  }
  return null;
}

function parseHeaderBlock(lines) {
  const result = {};
  if (!lines[0]) return result;
  result.name = lines[0];
  if (lines[1] && lines[1] !== 'Stallion' && lines[1] !== 'Mare' && lines[1] !== 'Gelding') {
    result.description = lines[1];
  }
  const genderRe = /^(Stallion|Mare|Gelding|Colt|Filly)$/i;
  const ageRe = /\d+\s*(years?|months?)/i;
  const stopWords = new Set(['BETA', 'Needs care', 'Care', '']);

  for (let i = 1; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    if (!line || stopWords.has(line) || LINK_LINE_RE.test(line)) continue;
    if (genderRe.test(line)) result.gender = line;
    else if (ageRe.test(line)) result.age_text = line;
    else if (line === '* Care' || line.startsWith('* ')) break; // Reiter-Navigation erreicht
    else if (!result.breed && line !== result.description) result.breed = line;
  }
  return result;
}

function parsePassportBlock(lines) {
  const result = {};
  const passportIdx = findLineIndex(lines, (l) => l === 'Passport');
  if (passportIdx === -1) return result;

  const gp = findLabelValue(lines, 'Genetic Potential', passportIdx);
  if (gp) {
    const n = parseFloat(gp.value.replace(',', '.'));
    if (!Number.isNaN(n)) result.genetic_potential = n;
  }
  const conformation = findLabelValue(lines, 'Conformation', passportIdx);
  if (conformation) result.conformation = conformation.value;

  const testedColours = findLabelValue(lines, 'Tested Colours', passportIdx);
  if (testedColours) result.tested_colours = testedColours.value;

  const training = findLabelValue(lines, 'Training', passportIdx);
  if (training) result.training = training.value;

  const predicates = findLabelValue(lines, 'Predicates', passportIdx);
  if (predicates && predicates.value !== '-') result.predicates = predicates.value;

  return result;
}

function parsePedigreeBlock(lines) {
  const pedigreeIdx = findLineIndex(lines, (l) => l === 'Pedigree');
  if (pedigreeIdx === -1) return null;

  let i = pedigreeIdx + 1;
  let coi = null;
  const coiMatch = lines[i] && lines[i].match(/^COI:\s*([\d.,]+)\s*%/i);
  if (coiMatch) {
    coi = parseFloat(coiMatch[1].replace(',', '.'));
    i++;
  }

  const stopIdx = findLineIndex(lines, (l) => /this page was updated/i.test(l), i);
  const end = stopIdx === -1 ? lines.length : stopIdx;

  const entries = [];
  while (i < end) {
    const line = lines[i];
    if (!line) { i++; continue; }
    const m = line.match(LINK_LINE_RE);
    if (m) {
      const [, text, url] = m;
      const hrId = extractHrId(url);
      let next = i + 1;
      // Direkt nach Name/Link folgt oft eine zweite Zeile mit demselben
      // Link (z.B. ein "Foundation Breeder"-Abzeichen oder die Rasse) -
      // das ist kein eigener Stammbaum-Platz, sondern gehört noch zum
      // gerade gefundenen Vorfahren, und wird übersprungen.
      if (next < end) {
        const nm = lines[next] && lines[next].match(LINK_LINE_RE);
        if (nm && extractHrId(nm[2]) === hrId) next++;
      }
      entries.push({ name: text, link: url, hr_id: hrId });
      i = next;
    } else if (/^unknown$/i.test(line)) {
      entries.push(null);
      i++;
    } else {
      i++; // unbekanntes Zwischenformat - überspringen statt abzubrechen
    }
  }

  if (entries.length === 0) return { coi, tree: [] };

  const maxGeneration = guessMaxGeneration(entries.length);
  const order = buildFanOrder(maxGeneration);
  const tree = order.map((slot, idx) => {
    const e = entries[idx] || null;
    return {
      path: slot.path,
      generation: slot.generation,
      side: slot.side,
      hr_id: e ? e.hr_id : null,
      name: e ? e.name : null,
      link: e ? e.link : null,
    };
  });
  return { coi, tree };
}

function parseHorseRealityText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());

  const result = { raw_text_info: rawText };

  Object.assign(result, parseHeaderBlock(lines));
  Object.assign(result, parsePassportBlock(lines));

  const pedigree = parsePedigreeBlock(lines);
  if (pedigree) {
    result.coi = pedigree.coi;
    result.pedigree_tree = pedigree.tree;
    const sire = pedigree.tree.find((t) => t.path === 'S');
    const dam = pedigree.tree.find((t) => t.path === 'D');
    if (sire && sire.hr_id) {
      result.sire_hr_id = sire.hr_id;
      result.sire_name = sire.name;
      result.sire_link = sire.link;
    }
    if (dam && dam.hr_id) {
      result.dam_hr_id = dam.hr_id;
      result.dam_name = dam.name;
      result.dam_link = dam.link;
    }
  }

  return result;
}

// TODO sobald Beispieltext vorliegt: parseColourBlock (Farbgenetik-Tabelle
// je Genort), parseStatsBlock (Exterieur/Interieur/Disziplinen),
// parseFoalsBlock (Nachkommen-Liste mit hr_id/Name/Link je Fohlen).
