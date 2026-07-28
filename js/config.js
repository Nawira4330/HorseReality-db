// Supabase-Projektzugangsdaten.
// Diese Werte findest du in deinem Supabase-Projekt unter
// "Project Settings" -> "API": "Project URL" und "anon public" Key.
//
// Wichtig: Hier gehört NUR der "anon public" Key hinein, niemals der
// "service_role" Key! Der anon-Key ist bewusst dafür gemacht, im
// Browser/Frontend sichtbar zu sein - der eigentliche Schutz kommt über
// die Row-Level-Security-Regeln in supabase/schema.sql (nur eingeloggte
// Konten haben Zugriff) und den Login.
const SUPABASE_CONFIG = {
  url: 'https://gnlvgfxumkncbxrpxjgp.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdubHZnZnh1bWtuY2J4cnB4amdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTYwODAsImV4cCI6MjEwMDgzMjA4MH0.ttrqIkznMvhKcjDHR5nU0f5p3yWxuuWJdA54_gUkN6k',
};
