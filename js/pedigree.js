// Gemeinsame Stammbaum-Logik für view.html (Nachkommen, tiefer Stammbaum),
// inzucht.html (Inzuchtprüfer) und vergleich.html (Fohlenvergleich).
//
// Anders als beim Schwesterprojekt MDR-Datenbank (Stammbaum = unsortierte
// Namensliste, siehe dessen discord-bot/src/pedigree.js) verknüpfen wir hier
// über die zuverlässige Horse-Reality-ID (hr_id): jedes gespeicherte Pferd
// kennt sire_hr_id/dam_hr_id. Ist ein Vorfahre selbst als eigenes Pferd
// gespeichert, wird für die nächste Generation dessen LIVE sire_hr_id/
// dam_hr_id verwendet (das kann über mehrere eigene Pferde hinweg beliebig
// tief verketten) - ist er das nicht, greift als Rückfallebene der beim
// Einfügen erkannte pedigree_tree-Ausschnitt (typischerweise bis Generation
// 3, siehe js/parser.js). Erst danach gilt ein Vorfahre als "Unbekannt".

const PEDIGREE_MAX_GENERATION = 18;

const HORSE_LIGHT_COLUMNS_BASE = [
  'id', 'hr_id', 'name', 'link', 'image_url', 'gender', 'breed',
  'genetic_potential', 'conformation', 'tested_colours', 'coi',
  'sire_hr_id', 'sire_name', 'sire_link', 'dam_hr_id', 'dam_name', 'dam_link',
  'pedigree_tree', 'pangare', 'sooty', 'flaxen', 'sabino',
];
// Spalten aus späteren Migrationen (siehe supabase/migration_*.sql) - fehlt
// eine davon in der DB (Migration noch nicht ausgeführt), wird sie beim
// Laden automatisch weggelassen statt die gesamte Stammbaum-/Inzucht-/
// Vergleichs-/Aussortier-Funktionalität zu blockieren, nur weil eine
// einzelne optionale Spalte fehlt (siehe fetchAllHorsesLight unten).
const HORSE_LIGHT_OPTIONAL_COLUMNS = ['owner', 'tags'];

const PAGE_SIZE = 1000;

// Lädt alle Pferde mit den für Stammbaum-Berechnungen nötigen Spalten (kein
// select('*'), um raw_text/pedigree_tree bei vielen Zeilen nicht unnötig oft
// mitzuladen) - paginiert per .range(), falls die Tabelle die
// PostgREST-Standardgrenze (1000 Zeilen) überschreitet. Meldet die Abfrage
// eine fehlende optionale Spalte, wird genau diese entfernt und erneut
// versucht (mehrfach hintereinander, falls mehrere Migrationen fehlen).
async function fetchAllHorsesLight() {
  const all = [];
  let from = 0;
  let optionalColumns = [...HORSE_LIGHT_OPTIONAL_COLUMNS];
  for (;;) {
    let columns = HORSE_LIGHT_COLUMNS_BASE.concat(optionalColumns).join(', ');
    let { data, error } = await supabaseClient.from('horses').select(columns).range(from, from + PAGE_SIZE - 1);
    while (error) {
      const m = error.message.match(/column\s+"?(?:\w+\.)?(\w+)"?\s+does not exist/i);
      const missing = m && optionalColumns.includes(m[1]) ? m[1] : null;
      if (!missing) throw new Error(`Supabase-Fehler beim Laden der Pferde: ${error.message}`);
      optionalColumns = optionalColumns.filter((c) => c !== missing);
      columns = HORSE_LIGHT_COLUMNS_BASE.concat(optionalColumns).join(', ');
      ({ data, error } = await supabaseClient.from('horses').select(columns).range(from, from + PAGE_SIZE - 1));
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function buildHorsesByHrId(horses) {
  const map = new Map();
  horses.forEach((h) => { if (h.hr_id) map.set(h.hr_id, h); });
  return map;
}

function resolveSubtree(hrId, name, link, path, generation, maxGeneration, horsesByHrId, seedByPath) {
  if (generation > maxGeneration) return [];
  const seedNode = seedByPath.get(path);
  const node = {
    path, generation, side: path[path.length - 1],
    hr_id: hrId || null, name: name || null, link: link || null, image_url: null,
    // Werte des Vorfahren selbst: bevorzugt aus einem eigenen (importierten)
    // Datensatz, sonst best-effort aus dem beim Einfügen erkannten
    // Stammbaum-Badge (siehe parser.js extractAncestorStats) - siehe unten,
    // wo bei importierten Vorfahren die Live-Werte Vorrang bekommen.
    genetic_potential: seedNode ? seedNode.genetic_potential : null,
    conformation: seedNode ? seedNode.conformation : null,
  };
  if (!hrId || generation === maxGeneration) return [node];

  const imported = horsesByHrId.get(hrId);
  let sireId, sireName, sireLink, damId, damName, damLink;
  if (imported) {
    node.name = imported.name;
    node.link = imported.link;
    node.image_url = imported.image_url;
    node.horse_id = imported.id; // interne DB-id, falls man dorthin verlinken will
    node.genetic_potential = imported.genetic_potential;
    node.conformation = imported.conformation;
    sireId = imported.sire_hr_id; sireName = imported.sire_name; sireLink = imported.sire_link;
    damId = imported.dam_hr_id; damName = imported.dam_name; damLink = imported.dam_link;
  } else {
    const sSeed = seedByPath.get(path + 'S');
    const dSeed = seedByPath.get(path + 'D');
    sireId = sSeed && sSeed.hr_id; sireName = sSeed && sSeed.name; sireLink = sSeed && sSeed.link;
    damId = dSeed && dSeed.hr_id; damName = dSeed && dSeed.name; damLink = dSeed && dSeed.link;
  }

  return [
    node,
    ...resolveSubtree(sireId, sireName, sireLink, path + 'S', generation + 1, maxGeneration, horsesByHrId, seedByPath),
    ...resolveSubtree(damId, damName, damLink, path + 'D', generation + 1, maxGeneration, horsesByHrId, seedByPath),
  ];
}

// Baut den vollständigen (bis zu 18 Generationen tiefen) Stammbaum eines
// Pferds, indem live über andere gespeicherte Pferde verkettet wird, wo
// möglich, und auf den beim Einfügen erkannten pedigree_tree zurückgefallen
// wird, wo nicht.
function buildDeepPedigree(horse, horsesByHrId, maxGeneration = PEDIGREE_MAX_GENERATION) {
  const seedByPath = new Map((horse.pedigree_tree || []).map((e) => [e.path, e]));
  return [
    ...resolveSubtree(horse.sire_hr_id, horse.sire_name, horse.sire_link, 'S', 1, maxGeneration, horsesByHrId, seedByPath),
    ...resolveSubtree(horse.dam_hr_id, horse.dam_name, horse.dam_link, 'D', 1, maxGeneration, horsesByHrId, seedByPath),
  ];
}

// Direkte Nachkommen: alle Pferde, deren sire_hr_id/dam_hr_id auf dieses
// Pferd zeigen (nur möglich, wenn dieses Pferd selbst eine hr_id hat).
function findOffspring(horse, allHorses) {
  if (!horse.hr_id) return [];
  return allHorses.filter((h) => h.sire_hr_id === horse.hr_id || h.dam_hr_id === horse.hr_id);
}

function findSiblingsBySire(horse, allHorses) {
  if (!horse.sire_hr_id) return [];
  return allHorses.filter((h) => h.id !== horse.id && h.sire_hr_id === horse.sire_hr_id);
}

function findSiblingsByDam(horse, allHorses) {
  if (!horse.dam_hr_id) return [];
  return allHorses.filter((h) => h.id !== horse.id && h.dam_hr_id === horse.dam_hr_id);
}

// Halbgeschwister: teilen genau EIN Elternteil (Vater ODER Mutter, nicht
// beide - wer beide teilt, ist ein volles Geschwister und zählt hier bewusst
// nicht mit, siehe Aussortierhilfe).
function findHalfSiblings(horse, allHorses) {
  const bySire = new Set(findSiblingsBySire(horse, allHorses).map((h) => h.id));
  const byDam = new Set(findSiblingsByDam(horse, allHorses).map((h) => h.id));
  const halfIds = new Set([
    ...[...bySire].filter((id) => !byDam.has(id)),
    ...[...byDam].filter((id) => !bySire.has(id)),
  ]);
  return allHorses.filter((h) => halfIds.has(h.id));
}

// Findet gemeinsame Vorfahren zweier (tiefer) Stammbäume - jedes
// Pfad-Vorkommen zählt einzeln (ein Vorfahre kann auf einer Seite über
// mehrere Pfade auftauchen, falls dort schon Inzucht vorliegt).
function findCommonAncestors(pedigreeA, pedigreeB) {
  const byIdA = new Map();
  pedigreeA.filter((n) => n.hr_id).forEach((n) => {
    if (!byIdA.has(n.hr_id)) byIdA.set(n.hr_id, []);
    byIdA.get(n.hr_id).push(n);
  });
  const byIdB = new Map();
  pedigreeB.filter((n) => n.hr_id).forEach((n) => {
    if (!byIdB.has(n.hr_id)) byIdB.set(n.hr_id, []);
    byIdB.get(n.hr_id).push(n);
  });

  const common = [];
  for (const [hrId, occA] of byIdA) {
    if (!byIdB.has(hrId)) continue;
    for (const a of occA) {
      for (const b of byIdB.get(hrId)) {
        common.push({ hr_id: hrId, name: a.name, link: a.link, generationA: a.generation, generationB: b.generation });
      }
    }
  }
  return common;
}

// Inzuchtkoeffizient (Wright'sche Pfad-Methode) für eine gedachte
// Verpaarung zweier Pferde: COI = Summe über alle gemeinsamen
// Vorfahren-Pfade von (0.5)^(nA+nB+1) * (1 + F_Vorfahre). F_Vorfahre wird,
// falls bekannt, aus dessen eigenem (vom Spiel berechneten) coi-Feld
// übernommen, sonst als 0 angenommen.
function estimateCOI(pedigreeA, pedigreeB, horsesByHrId) {
  const commonAncestors = findCommonAncestors(pedigreeA, pedigreeB);
  let coi = 0;
  const contributions = commonAncestors.map((c) => {
    const ancestorHorse = horsesByHrId.get(c.hr_id);
    const fa = ancestorHorse && typeof ancestorHorse.coi === 'number' ? ancestorHorse.coi / 100 : 0;
    const contribution = Math.pow(0.5, c.generationA + c.generationB + 1) * (1 + fa);
    coi += contribution;
    return { ...c, contributionPct: contribution * 100 };
  });
  contributions.sort((a, b) => b.contributionPct - a.contributionPct);
  return { coiPct: coi * 100, commonAncestors: contributions };
}
