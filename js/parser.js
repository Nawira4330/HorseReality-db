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

// Erkennt das Pferdebild im eingefügten Text: entweder ein Markdown-
// Bildlink "![...](url)" (falls die Zwischenablage die Seite so umwandelt)
// oder ersatzweise die erste rohe Bild-URL (Dateiendung jpg/png/webp) im
// gesamten Text. Best effort - liefert null, wenn nichts gefunden wird.
function extractImageUrl(rawText) {
  const mdMatch = rawText.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) return mdMatch[1];
  const bareMatch = rawText.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)\b/i);
  return bareMatch ? bareMatch[0] : null;
}

// Der Link zur eigenen Pferdeseite steht NIE im kopierten Reiter-Text (der
// eigene Name ist dort kein Hyperlink, anders als bei Vorfahren) - wird nur
// gefunden, wenn zusätzlich die Adresszeile mit in die Box eingefügt wurde
// (eine eigene Zeile, die nur aus der reinen horsereality.com/horses/ID-URL
// besteht - im Unterschied zu Vorfahren-Links steht hier kein Name davor).
const OWN_LINK_RE = /^https?:\/\/(?:www\.|v2\.)?horsereality\.com\/horses\/\d+\/?(?:\?.*)?$/i;
function extractOwnLink(lines) {
  const line = lines.find((l) => OWN_LINK_RE.test(l));
  return line || null;
}

// Kopiert man direkt aus dem Spiel (z.B. Strg+A/Strg+C auf der ganzen
// Seite statt nur eines Textabschnitts), legt der Browser neben dem reinen
// Text zusätzlich eine HTML-Fassung der Auswahl in die Zwischenablage
// ("text/html") ab - darin sind, anders als im reinen Text, auch Bilder
// (<img src=...>) und ggf. echte Links enthalten (der Link zur eigenen
// Pferdeseite taucht im sichtbaren Text nirgends als Link auf, siehe
// extractOwnLink oben - in der HTML-Struktur der Seite unter Umständen
// trotzdem, z.B. als "Teilen"-Link oder Canonical-Verweis). Pferdefotos
// werden über eine eigene Bild-Domain ausgeliefert (bestätigtes Beispiel:
// https://horse-img.horsereality.com/large/...) - Bilder von dort werden
// bevorzugt gewählt (bei mehreren Größenvarianten die "/large/"-Variante),
// das ist zuverlässiger als der Versuch, Seiten-Chrome (Logo, Icons,
// Kartensymbole etc.) per Ausschlussliste zu erkennen, die nie vollständig
// sein kann. Nur falls kein Bild von dieser Domain im eingefügten HTML
// steckt, greift ersatzweise die alte Ausschlussliste-Heuristik. Relative
// Pfade werden gegen die Spiel-Domain aufgelöst - DOMParser würde sie sonst
// fälschlich gegen die aktuelle Seite (also diese Datenbank-App) auflösen.
const HORSE_IMAGE_HOST_RE = /^https?:\/\/horse-img\.horsereality\.com\//i;
const CHROME_IMAGE_HINT_RE = /logo|favicon|icon|sprite|flag|badge|avatar-default|placeholder|spinner|loading|\/world\/|map-/i;
function extractFromPasteHtml(html) {
  const result = {};
  if (!html || typeof DOMParser === 'undefined') return result;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = 'https://www.horsereality.com/';

  const allImages = [...doc.querySelectorAll('img[src]')]
    .map((img) => {
      const raw = img.getAttribute('src');
      let resolved;
      try { resolved = new URL(raw, base).href; } catch { return null; }
      const w = parseInt(img.getAttribute('width'), 10) || 0;
      const h = parseInt(img.getAttribute('height'), 10) || 0;
      return { src: resolved, area: w * h };
    })
    .filter((i) => i && /^https?:\/\//.test(i.src));

  const horseImages = allImages.filter((i) => HORSE_IMAGE_HOST_RE.test(i.src));
  const candidates = horseImages.length
    ? horseImages
    : allImages.filter((i) => !CHROME_IMAGE_HINT_RE.test(i.src));
  if (candidates.length) {
    candidates.sort((a, b) => {
      const aLarge = /\/large\//i.test(a.src) ? 1 : 0;
      const bLarge = /\/large\//i.test(b.src) ? 1 : 0;
      if (aLarge !== bLarge) return bLarge - aLarge;
      return b.area - a.area;
    });
    result.image_url = candidates[0].src;
  }

  // Absichtlich KEINE automatische Link-Erkennung mehr über die Links im
  // HTML-Fragment: der erste Treffer auf "/horses/<id>/" muss nicht der
  // eigene Link sein, sondern kann z.B. aus dem Stammbaum-Bereich (ein
  // Vorfahre) oder einer Listenansicht stammen. Das hat am 12.08.2026 dazu
  // geführt, dass beim Massenerfassen mehrerer Fohlen hintereinander
  // systematisch die Spiel-ID des JEWEILS VORHERIGEN Pferds übernommen
  // wurde (Kollision mit dessen hr_id, dadurch versehentliches Überschreiben
  // statt Neuanlage) - der Link muss deshalb weiterhin manuell eingetragen
  // werden, oder über extractOwnLink (nur eine bewusst mitkopierte, für
  // sich stehende Adresszeile, siehe oben - deutlich weniger mehrdeutig als
  // "irgendein Link im HTML").

  return result;
}

function findLineIndex(lines, predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

// Sucht eine "Label"-Zeile (z.B. "Genetic Potential") und gibt die nächste
// nicht-leere Zeile danach als Wert zurück - Horse Reality zeigt Label und
// Wert im kopierten Text jeweils auf eigenen Zeilen. "to" begrenzt die Suche
// nach oben (z.B. bis zum nächsten Abschnitt), damit bei mehreren
// hintereinander eingefügten Reitern keine Verwechslung mit gleichnamigen
// Überschriften aus einem späteren Abschnitt passiert.
function findLabelValue(lines, label, from = 0, to = lines.length) {
  const idx = findLineIndex(lines, (l) => l === label, from);
  if (idx === -1 || idx >= to) return null;
  for (let i = idx + 1; i < to; i++) {
    if (lines[i]) return { value: lines[i], index: i };
  }
  return null;
}

// Abzeichen-Texte, die manchmal als reiner Text statt als Link im kopierten
// Text stehen (je nachdem wie Horse Reality die Seite gerade rendert) -
// dürfen nie als Beschreibung oder Rasse missverstanden werden.
const BADGE_WORDS = new Set(['Foundation Breeder', 'BETA', 'Needs care', 'Care']);

// Erkennt Werte-Badge-/Bewertungs-Zeilen im linkfreien Stammbaum-Format
// (z.B. "GP 640", "COI: n/a", "☆ 821/13:1:0:0/91.515", "14VG* 92.3 GGGGG",
// "10:4 |866| G/D/SW1/To") - das Format ist nicht einheitlich (jede Person
// schreibt den Untertitel ihrer Pferde anders, siehe extractAncestorStats),
// aber Konformationsnoten (VG/G+ usw.), "GP"/"COI:" gefolgt von Ziffern,
// Trennzeichen (|, ┃, ☆, ★) oder Erfolgsstatistiken ("13:1:0:0") kommen in
// echten Pferdenamen praktisch nie vor. Verhindert, dass sowas fälschlich
// als Vorfahren-Name gespeichert wird (siehe Vorfall 12.08.2026).
const PEDIGREE_BADGE_LINE_RE = /\bVG\b|\bGP\s?\d|COI\s*:|[|┃☆★]|\d+:\d+:\d+/i;

function parseHeaderBlock(lines) {
  const result = {};
  if (!lines[0]) return result;
  result.name = lines[0];
  const genderRe = /^(Stallion|Mare|Gelding|Colt|Filly)$/i;

  // Manche Kopiermethoden fügen zwischen jedem Feld eine eigene Leerzeile
  // ein (z.B. beim Kopieren der ganzen Seite statt nur des Passport-
  // Widgets) - für die Kopfzeilen-Erkennung werden diese Leerzeilen
  // ignoriert, damit die Positionslogik unabhängig vom Zeilenabstand
  // funktioniert.
  const content = [];
  for (let i = 1; i < lines.length && content.length < 10; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line === '* Care' || line.startsWith('* ')) break; // Reiter-Navigation erreicht
    content.push(line);
  }

  if (content[0] && !genderRe.test(content[0]) && !BADGE_WORDS.has(content[0]) && !LINK_LINE_RE.test(content[0])) {
    result.description = content[0];
  }
  const ageRe = /\d+\s*(years?|months?)/i;

  for (const line of content) {
    if (BADGE_WORDS.has(line) || LINK_LINE_RE.test(line)) continue;
    if (genderRe.test(line)) result.gender = line;
    else if (ageRe.test(line)) result.age_text = line;
    else if (!result.breed && line !== result.description) result.breed = line;
  }
  return result;
}

function parsePassportBlock(lines) {
  const result = {};
  const passportIdx = findLineIndex(lines, (l) => l === 'Passport');
  if (passportIdx === -1) return result;
  // Auf den Pedigree-Abschnitt begrenzen, damit bei mehreren eingefügten
  // Reitern in derselben Box keine gleichnamige Überschrift eines späteren
  // Abschnitts (z.B. die eigene "Conformation"-Überschrift im Stats-Reiter)
  // fälschlich als Passport-Wert gelesen wird.
  const pedigreeIdx = findLineIndex(lines, (l) => l === 'Pedigree', passportIdx);
  const end = pedigreeIdx === -1 ? lines.length : pedigreeIdx;

  const gp = findLabelValue(lines, 'Genetic Potential', passportIdx, end);
  if (gp) {
    const n = parseFloat(gp.value.replace(',', '.'));
    if (!Number.isNaN(n)) result.genetic_potential = n;
  }
  const conformation = findLabelValue(lines, 'Conformation', passportIdx, end);
  if (conformation) result.conformation = conformation.value;

  const testedColours = findLabelValue(lines, 'Tested Colours', passportIdx, end);
  if (testedColours) result.tested_colours = testedColours.value;

  const training = findLabelValue(lines, 'Training', passportIdx, end);
  if (training) result.training = training.value;

  const predicates = findLabelValue(lines, 'Predicates', passportIdx, end);
  if (predicates && predicates.value !== '-') result.predicates = predicates.value;

  return result;
}

// --- Colour-Reiter: Farbgenetik-Tabelle je Genort ---
// Aufbau im kopierten Text: 3 Zeilen je Genort (Anzeige-Label, technischer
// Genname, Genotyp "Allel1 / Allel2"), gruppiert unter Zwischenüberschriften
// wie "Colours & Modifiers", "Dilutions", "White Patterns". Wird über ein
// 2-Zeilen-Lookahead erkannt (Label + technischer Name + darauffolgende
// Genotyp-Zeile), alles andere gilt als Gruppen-Überschrift.
const GENOTYPE_PAIR_RE = /^(\S+)\s*\/\s*(\S+)$/;

function parseColourBlock(lines) {
  const startIdx = findLineIndex(lines, (l) => l === 'Colours & Patterns');
  if (startIdx === -1) return null;
  const endIdx = findLineIndex(lines, (l) => l === 'Genetic potential', startIdx);
  const end = endIdx === -1 ? lines.length : endIdx;

  const loci = [];
  let currentCategory = null;
  let i = startIdx + 1;
  while (i < end) {
    const line = lines[i];
    if (!line) { i++; continue; }

    // Manche Kopiermethoden stellen jedem Genort zusätzlich eine eigene
    // "Tested"-Zeile voran (Label/technischer Name/Genotyp rücken dadurch
    // um eine Zeile weiter nach hinten). Genorte ohne Genotyp-Zeile danach
    // sind schlicht nicht getestet (z.B. Tobiano/Roan/W8, wenn nur SW1/W21
    // vom selben Gen-Cluster einen Wert zeigen) - werden übersprungen, ohne
    // die aktuelle Gruppen-Überschrift zu verändern.
    if (line === 'Tested') {
      const label = lines[i + 1];
      const technical = lines[i + 2];
      const genotype = lines[i + 3];
      if (i + 3 < end && label && technical && genotype && GENOTYPE_PAIR_RE.test(genotype)) {
        const m = genotype.match(GENOTYPE_PAIR_RE);
        loci.push({
          category: currentCategory,
          label,
          technical_name: technical,
          genotype,
          allele1: m[1],
          allele2: m[2],
        });
        i += 4;
        continue;
      }
      i += label ? 2 : 1;
      continue;
    }

    const next1 = lines[i + 1];
    const next2 = lines[i + 2];
    if (i + 2 < end && next1 && next2 && GENOTYPE_PAIR_RE.test(next2)) {
      const m = next2.match(GENOTYPE_PAIR_RE);
      loci.push({
        category: currentCategory,
        label: line,
        technical_name: next1,
        genotype: next2,
        allele1: m[1],
        allele2: m[2],
      });
      i += 3;
      continue;
    }
    currentCategory = line;
    i++;
  }
  return loci;
}

// --- "Genetic potential" Abschnitt (folgt direkt auf den Colour-Reiter im
// Spiel) - GP-Gesamtwert (zum Abgleich mit dem Passport-Wert) und die
// Disziplin-/Eigenschafts-Potenzialwerte (Acceleration, Agility, ...). Stoppt
// beim ersten nicht-numerischen Wert (z.B. Bild-Bildunterschrift danach).
function parseDisciplinesBlock(lines) {
  const idx = findLineIndex(lines, (l) => l === 'Genetic potential');
  if (idx === -1) return null;

  let i = idx + 1;
  let gpTotal = null;
  const gpMatch = lines[i] && lines[i].match(/^GP total:\s*([\d.,]+)/i);
  if (gpMatch) {
    gpTotal = parseFloat(gpMatch[1].replace(',', '.'));
    i++;
  }

  const disciplines = {};
  while (i + 1 < lines.length) {
    const label = lines[i];
    const value = lines[i + 1];
    if (!label || !value || !/^\d+([.,]\d+)?$/.test(value)) break;
    disciplines[label] = parseFloat(value.replace(',', '.'));
    i += 2;
  }
  return { gpTotal, disciplines };
}

// --- Beschreibende Exterieur-/Gangarten-Bewertung (Stats-Reiter) - je
// Gangart (Walk/Trot/Canter/Gallop) und Körperteil (Posture/Head/Neck/...)
// eine Note aus einem festen Wortschatz. Diese Summe ergibt genau den
// Passport-Wert "Conformation" (z.B. 2x Good + 3x Average + 7x Below
// average = "2G 3A 7BA"). Da "Conformation" auch als Passport-Label
// vorkommt, wird gezielt die Überschrift genommen, der direkt eine
// bekannte Note folgt (nicht die erste "Conformation"-Zeile im Text).
const CONFORMATION_GRADE_WORDS = ['Excellent', 'Very good', 'Good', 'Average', 'Below average', 'Poor', 'Bad'];

function parseConformationDescriptiveBlock(lines) {
  // Anchor: "Conformation" heading, gefolgt von (Label, Note)-Paaren, z.B.
  // "Conformation" / "Walk" / "Good" - die Note steht also 2 Zeilen später,
  // nicht direkt danach (das wäre die Passport-"Conformation"-Zeile).
  const idx = lines.findIndex((l, i) => l === 'Conformation' && CONFORMATION_GRADE_WORDS.includes(lines[i + 2]));
  if (idx === -1) return null;

  let i = idx + 1;
  const items = {};
  while (i + 1 < lines.length) {
    const label = lines[i];
    const value = lines[i + 1];
    if (!label || !CONFORMATION_GRADE_WORDS.includes(value)) break;
    items[label] = value;
    i += 2;
  }
  return items;
}

// Vorfahren mit bekanntem Stammbaum zeigen zusätzlich zum Namen 1-2 weitere
// Zeilen mit demselben Link: bei Foundation-Breeder-Pferden nur ein
// Abzeichen ("Foundation Breeder"), bei regulär gezüchteten Pferden ein
// Werte-Badge (GP/Conformation/Score, z.B. "☆ 826/13:1:0:0/91.573") gefolgt
// vom Stall-Namen. Das Badge-Format ist NICHT einheitlich - jede Person
// schreibt den Untertitel ihrer Pferde anders (z.B. "804|12|91.398GGGGG-E"
// oder "817 14VG" oder "800 10VG ret"). Best effort: die ersten
// Ziffern-vor-"/"-oder-"|" werden als GP interpretiert, "NNVG..." oder
// "N:N:N:N" als Conformation - beides wird nur übernommen, wenn ein
// Muster eindeutig passt, der komplette Rohtext bleibt in "badge" immer
// erhalten, damit nichts verloren geht.
function extractAncestorStats(extraLines) {
  const badge = extraLines.join(' · ') || null;
  let genetic_potential = null;
  let conformation = null;
  for (const line of extraLines) {
    if (genetic_potential == null) {
      const gpMatch = line.match(/(\d{2,4})\s*[/|]/);
      if (gpMatch) genetic_potential = parseInt(gpMatch[1], 10);
    }
    if (conformation == null) {
      const confMatch = line.match(/(\d+\s*VG[\w\s+*.-]*)/i) || line.match(/(\d+:\d+:\d+:\d+)/);
      if (confMatch) conformation = confMatch[1].trim();
    }
  }
  const result = { badge };
  if (genetic_potential != null) result.genetic_potential = genetic_potential;
  if (conformation != null) result.conformation = conformation;
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
      // Direkt nach Name/Link folgen oft weitere Zeilen mit demselben Link
      // (Foundation-Breeder-Pferde: 1 Abzeichen "Foundation Breeder";
      // regulär gezüchtete Pferde: Werte-Badge + Stall-Name, siehe
      // extractAncestorStats) - das sind keine eigenen Stammbaum-Plätze,
      // sondern gehören noch zum gerade gefundenen Vorfahren.
      const extraLines = [];
      let next = i + 1;
      while (next < end) {
        const nm = lines[next] && lines[next].match(LINK_LINE_RE);
        if (nm && extractHrId(nm[2]) === hrId) {
          extraLines.push(nm[1]);
          next++;
        } else break;
      }
      entries.push({ name: text, link: url, hr_id: hrId, ...extractAncestorStats(extraLines) });
      i = next;
    } else if (/^unknown$/i.test(line)) {
      entries.push(null);
      i++;
    } else if (BADGE_WORDS.has(line) || PEDIGREE_BADGE_LINE_RE.test(line)) {
      // Werte-Badge/Bewertung/Stall-Zeile (siehe PEDIGREE_BADGE_LINE_RE) -
      // keine eigene Stammbaum-Position, wird übersprungen statt fälschlich
      // als Vorfahren-Name übernommen zu werden.
      i++;
    } else {
      // Manche Kopiermethoden liefern den Stammbaum ohne Markdown-Links
      // (reiner Name statt "[Name](url)") - dann lässt sich hr_id/Link
      // nicht ermitteln, der Name selbst aber schon. Ein Stall-/Zuchtname
      // ohne erkennbare Zahlen/Symbole (z.B. "Nordrassil") ist von einem
      // echten Vorfahren-Namen weiterhin nicht sicher unterscheidbar und
      // kann fälschlich als eigener Platz gezählt werden - für zuverlässige
      // tiefe Stammbäume bleibt ein Link-Paste nötig, aber Vater/Mutter
      // (die ersten Einträge) sind davon in der Praxis kaum betroffen.
      entries.push({ name: line, link: null, hr_id: null });
      i++;
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
      genetic_potential: e && e.genetic_potential != null ? e.genetic_potential : null,
      conformation: e && e.conformation != null ? e.conformation : null,
      badge: e && e.badge != null ? e.badge : null,
    };
  });
  return { coi, tree };
}

// Manche Kopiermethoden liefern Navigations-/Menüpunkte als "* Text" statt
// als eigene Zeile, andere als Markdown-Link "* [Text](url)" oder
// "[Text](url)" - für Vergleiche mit bekannten Fixtexten (z.B. "Go To
// City", "Contact") wird das auf den reinen Text reduziert.
function plainLineText(line) {
  if (!line) return line;
  const noBullet = line.startsWith('* ') ? line.slice(2) : line;
  const m = noBullet.match(LINK_LINE_RE);
  return m ? m[1] : noBullet;
}

// Wird beim Kopieren der GANZEN Seite (statt nur des sichtbaren
// Reiter-Inhalts) vor jedem Abschnitt mitkopiert: linke Navigationsleiste
// ("Horse Reality" / "HR Time: ..." / Kontostand / Menü ... bis "Go To
// City", je nach Kopiermethode einmal oder zweimal hintereinander) und
// Seiten-Footer ("Studio Deloryan" ... bis "Contact"). Beides ist bei jedem
// Aufruf identisch und wiederholt sich pro eingefügtem Abschnitt - wird
// herausgefiltert, damit z.B. nicht "Horse Reality"/"HR Time: ..." statt
// des tatsächlichen Pferdenamens als erste Zeile erkannt wird.
function stripSiteChrome(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] === 'Horse Reality' || /^HR Time:/.test(lines[i])) {
      let j = i;
      let sawGoToCity = false;
      let end = -1;
      while (j < lines.length && j < i + 250) {
        if (plainLineText(lines[j]) === 'Go To City') {
          sawGoToCity = true;
          end = j;
        } else if (sawGoToCity && lines[j]) {
          break; // erste inhaltliche Zeile nach der Navigationsleiste erreicht
        }
        j++;
      }
      if (sawGoToCity) {
        i = end + 1;
        continue;
      }
    }
    if (lines[i] === 'Studio Deloryan') {
      let j = i + 1;
      while (j < lines.length && plainLineText(lines[j]) !== 'Contact') j++;
      i = j + 1;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out;
}

function parseHorseRealityText(rawText) {
  const lines = stripSiteChrome(rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()));
  // parseHeaderBlock erwartet den Pferdenamen in lines[0] - nach dem
  // Entfernen der Navigationsleiste kann davor noch eine Leerzeile stehen.
  while (lines.length && !lines[0]) lines.shift();

  const result = { raw_text_info: rawText };

  const imageUrl = extractImageUrl(rawText);
  if (imageUrl) result.image_url = imageUrl;

  const ownLink = extractOwnLink(lines);
  if (ownLink) result.link = ownLink;

  Object.assign(result, parseHeaderBlock(lines));
  Object.assign(result, parsePassportBlock(lines));

  const pedigree = parsePedigreeBlock(lines);
  if (pedigree) {
    result.coi = pedigree.coi;
    result.pedigree_tree = pedigree.tree;
    const sire = pedigree.tree.find((t) => t.path === 'S');
    const dam = pedigree.tree.find((t) => t.path === 'D');
    if (sire && sire.name) {
      result.sire_name = sire.name;
      if (sire.hr_id) {
        result.sire_hr_id = sire.hr_id;
        result.sire_link = sire.link;
      }
    }
    if (dam && dam.name) {
      result.dam_name = dam.name;
      if (dam.hr_id) {
        result.dam_hr_id = dam.hr_id;
        result.dam_link = dam.link;
      }
    }
  }

  const colors = parseColourBlock(lines);
  if (colors && colors.length) result.colors = colors;

  const disciplinesBlock = parseDisciplinesBlock(lines);
  if (disciplinesBlock) {
    if (Object.keys(disciplinesBlock.disciplines).length) result.disciplines = disciplinesBlock.disciplines;
    if (result.genetic_potential == null && disciplinesBlock.gpTotal != null) {
      result.genetic_potential = disciplinesBlock.gpTotal;
    }
  }

  const exterior = parseConformationDescriptiveBlock(lines);
  if (exterior && Object.keys(exterior).length) result.exterior = exterior;

  return result;
}

// TODO sobald Beispieltext vorliegt: parseFoalsBlock (Nachkommen-Liste mit
// hr_id/Name/Link je Fohlen, aus dem Foals-Reiter).

// Wird beim Speichern gebraucht, wenn sich herausstellt, dass ein Pferd mit
// gleicher hr_id/gleichem Namen bereits existiert (siehe horseForm.js/
// massenerfassung.js): ein frischer Paste enthält oft nur einen Teil der
// Reiter (z.B. nur nochmal Colour, ohne Passport/Stammbaum) - ohne Merge
// würde ein stumpfes UPDATE die beim ersten Mal erfassten Werte der
// fehlenden Felder überschreiben/löschen. Ein leerer/nicht angegebener Wert
// im neuen Payload wird deshalb durch den bereits gespeicherten Wert
// ergänzt, ein tatsächlich angegebener neuer Wert überschreibt wie gewohnt
// (gleiches Prinzip wie mergePayloadFromExisting im Schwesterprojekt
// MDR-Datenbank).
function isEmptyPayloadValue(value) {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
function mergePayloadWithExisting(payload, existing) {
  const merged = { ...payload };
  for (const key of Object.keys(existing)) {
    if (key === 'id' || key === 'created_at') continue;
    if (isEmptyPayloadValue(merged[key]) && !isEmptyPayloadValue(existing[key])) {
      merged[key] = existing[key];
    }
  }
  return merged;
}

// Baut den Bestätigungstext fürs Speichern eines per hr_id/Name gefundenen,
// bereits vorhandenen Pferds. Weicht der gefundene Name deutlich vom neu
// eingegebenen ab, ist das ein Warnzeichen: die hr_id wurde dann vermutlich
// bei einem früheren Speichern versehentlich einem falschen Datensatz
// zugeordnet (genau das ist am 12.08. passiert - "573 EA pa" wurde dadurch
// fälschlich mit den Daten von "554 EA²SW1W21" überschrieben, weil die
// normale Kurzfrage beim schnellen Durcharbeiten übersehen wurde) - deshalb
// hier eine deutlich auffälligere Warnung statt der normalen Kurzfrage.
function buildDuplicateConfirmMessage(newName, existingName) {
  const differs = existingName && newName
    && existingName.trim().toLowerCase() !== newName.trim().toLowerCase();
  if (differs) {
    return `⚠️ ACHTUNG - ANDERER NAME GEFUNDEN! ⚠️\n\n`
      + `Du speicherst: "${newName}"\n`
      + `Gefunden (gleiche Spiel-ID): "${existingName}"\n\n`
      + `Ist das wirklich dasselbe Pferd (z.B. nur im Spiel umbenannt)? `
      + `Falls nicht, bitte "Als neues Pferd anlegen" wählen, statt zu `
      + `ergänzen - sonst werden die Daten von "${existingName}" überschrieben!`;
  }
  return `"${existingName}" ist bereits in der Datenbank.`;
}

// Zeigt die Ja/Neu/Abbrechen-Auswahl (Modal-Markup aus horse.html/
// massenerfassung.html, #duplicate-modal) und liefert, welche Aktion
// gewählt wurde:
// - "merge": gefundenen Datensatz ergänzen/aktualisieren (mergePayloadWithExisting)
// - "new": als eigenständiges NEUES Pferd anlegen, den Treffer ignorieren -
//   wichtig, wenn eine falsch zugeordnete hr_id einen komplett anderen
//   Datensatz gefunden hat (siehe Vorfall 12.08.2026)
// - "cancel": gar nicht speichern
// "Als neues Pferd anlegen" wird nur angeboten, wenn sich die Namen
// unterscheiden - sind sie identisch (Treffer über den eindeutigen Namen
// gefunden), würde eine Neuanlage sofort am Namens-Index scheitern
// ("duplicate key value violates unique constraint horses_name_unique_idx"),
// da kann es sich nur um dasselbe Pferd handeln.
function askDuplicateAction(newName, existingName) {
  const differs = existingName && newName
    && existingName.trim().toLowerCase() !== newName.trim().toLowerCase();
  document.querySelector('#duplicate-modal-message').textContent = buildDuplicateConfirmMessage(newName, existingName);
  document.querySelector('#duplicate-modal').hidden = false;
  const newBtn = document.querySelector('#duplicate-modal-new');
  newBtn.hidden = !differs;
  return new Promise((resolve) => {
    const cancelBtn = document.querySelector('#duplicate-modal-cancel');
    const mergeBtn = document.querySelector('#duplicate-modal-merge');
    const cleanup = () => {
      document.querySelector('#duplicate-modal').hidden = true;
      cancelBtn.removeEventListener('click', onCancel);
      newBtn.removeEventListener('click', onNew);
      mergeBtn.removeEventListener('click', onMerge);
    };
    const onCancel = () => { cleanup(); resolve('cancel'); };
    const onNew = () => { cleanup(); resolve('new'); };
    const onMerge = () => { cleanup(); resolve('merge'); };
    cancelBtn.addEventListener('click', onCancel);
    newBtn.addEventListener('click', onNew);
    mergeBtn.addEventListener('click', onMerge);
  });
}
