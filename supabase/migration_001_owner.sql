-- Fuegt ein Besitzer-Feld hinzu (falls z.B. Pferde eines Zuchtpartners/einer
-- Zuchtpartnerin mit im selben Bestand gefuehrt werden) - freier Text wie
-- bei MDR-Datenbank, kein fester Konten-Bezug. In Supabase Dashboard unter
-- "SQL Editor" einfuegen und ausfuehren.

alter table public.horses add column if not exists owner text;

create index if not exists horses_owner_idx on public.horses (owner);
