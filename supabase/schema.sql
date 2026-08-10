-- HorseReality-Datenbank - Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" komplett einfügen und ausführen.

create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- Stammdaten (aus dem Info-Reiter, "Passport")
  hr_id text,                    -- Horse-Reality-ID aus der URL, z.B. "25559968"
  name text not null,
  description text,              -- kurzer Untertitel unter dem Namen, z.B. "Flax c sw1 w21"
  link text,                     -- volle Pferdeseiten-URL im Spiel
  image_url text,
  gender text,                   -- Stallion / Mare / Gelding
  age_text text,                 -- Rohtext, z.B. "12 years 11 months"
  breed text,
  genetic_potential numeric,     -- GP
  conformation text,             -- Rohtext, z.B. "1VG 12G 1A"
  tested_colours text,           -- Rohtext, z.B. "Ee AA gg SW1n W21n"
  predicates text,
  training text,

  -- Stammbaum
  sire_hr_id text,               -- direkte Verknuepfung zum Vater (falls bekannt/verlinkt)
  sire_name text,
  sire_link text,
  dam_hr_id text,
  dam_name text,
  dam_link text,
  pedigree_tree jsonb,           -- vollstaendiger vom Spiel angezeigter Ausschnitt (mehrere Generationen,
                                  -- je Vorfahre: generation, side, hr_id, name, link) - tiefere Generationen
                                  -- werden zur Laufzeit ueber sire_hr_id/dam_hr_id anderer Datensaetze
                                  -- rekursiv verkettet (bis zu 18 Generationen), siehe js/pedigree.js
  coi numeric,                   -- vom Spiel berechneter Inzuchtkoeffizient (COI), als Basis fuer den Inzuchtpruefer

  -- Farbgenetik (Colour-Reiter)
  colors jsonb,                  -- Farbgenetik-Tabelle, je Genort Wert + Status (getestet/vermutet)

  -- Exterieur/Interieur/Disziplinen (Stats-Reiter) - Struktur wird ergaenzt,
  -- sobald ein Beispieltext des Stats-Reiters vorliegt
  exterior jsonb,
  temperament jsonb,
  disciplines jsonb,

  -- Optische Merkmale, die das Spiel nicht genetisch aufschluesselt (nur im
  -- Bild erkennbar) - vorerst manuell/unbekannt, bis Referenzbilder zur
  -- automatischen Einordnung vorliegen (siehe Projektnotizen)
  pangare text,                  -- ja / nein / unbekannt
  sooty text,
  flaxen text,
  sabino text,

  -- Rohtexte je Reiter, immer zusaetzlich gespeichert (Fallback / Re-Parsing,
  -- falls sich das Seitenlayout im Spiel aendert oder der Parser etwas
  -- falsch erkennt)
  raw_text_info text,
  raw_text_colour text,
  raw_text_stats text,
  raw_text_foals text,

  notes text,
  owner text,                    -- freier Text, z.B. falls Pferde eines Zuchtpartners mitgefuehrt werden

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verhindert doppelte Importe desselben Horse-Reality-Pferds.
create unique index if not exists horses_hr_id_unique_idx on public.horses (hr_id) where hr_id is not null;
create unique index if not exists horses_name_unique_idx on public.horses (lower(name));

create index if not exists horses_user_id_idx on public.horses (user_id);
create index if not exists horses_sire_hr_id_idx on public.horses (sire_hr_id);
create index if not exists horses_dam_hr_id_idx on public.horses (dam_hr_id);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists horses_set_updated_at on public.horses;
create trigger horses_set_updated_at
before update on public.horses
for each row execute function public.set_updated_at();

-- Row Level Security: nur eingeloggte Konten (siehe README) duerfen lesen/
-- schreiben - dieses Projekt ist bewusst persoenlich (nicht wie MDR-Datenbank
-- geteilt), aber falls spaeter ein zweites Konto (z.B. Zuchtpartner*in)
-- dazukommt, sehen alle eingeloggten Konten dieselbe Datenbank.
alter table public.horses enable row level security;

drop policy if exists "horses_select_authenticated" on public.horses;
create policy "horses_select_authenticated" on public.horses
  for select to authenticated using (true);

drop policy if exists "horses_insert_authenticated" on public.horses;
create policy "horses_insert_authenticated" on public.horses
  for insert to authenticated with check (true);

drop policy if exists "horses_update_authenticated" on public.horses;
create policy "horses_update_authenticated" on public.horses
  for update to authenticated using (true);

drop policy if exists "horses_delete_authenticated" on public.horses;
create policy "horses_delete_authenticated" on public.horses
  for delete to authenticated using (true);

-- Storage-Bucket fuer per Zwischenablage eingefuegte Bilder (analog zu
-- MDR-Datenbank) - Hochladen bleibt eingeloggten Konten vorbehalten, Lesen
-- ist oeffentlich (fuer <img>-Anzeige ohne eigene Session).
insert into storage.buckets (id, name, public)
values ('horse-images', 'horse-images', true)
on conflict (id) do nothing;

drop policy if exists "horse_images_insert_authenticated" on storage.objects;
create policy "horse_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'horse-images');

drop policy if exists "horse_images_select_public" on storage.objects;
create policy "horse_images_select_public" on storage.objects
  for select to public
  using (bucket_id = 'horse-images');
