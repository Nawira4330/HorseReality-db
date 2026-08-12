-- Schlagwoerter je Pferd (siehe HORSE_TAG_OPTIONS in js/tags.js) - Array von
-- Label-Strings, z.B. ["Zucht", "Behalten"].
alter table public.horses add column if not exists tags jsonb;
