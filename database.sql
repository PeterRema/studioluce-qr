-- Dove la luce incontra il suono · schema Supabase (v3, risposta multipla)
-- Esegui in Supabase > SQL Editor. Lo script è rieseguibile: va bene sia su un
-- progetto nuovo sia su un database dove avevi già eseguito una versione precedente.
-- Nessun dato esistente (sessioni, voti, modelli) viene cancellato.
--
-- Novità v3:
--   · ogni domanda di un modello può accettare più risposte ("multi": true);
--   · contatore dei partecipanti per sessione (participant_counts);
--   · nuova funzione di invio submit_vote_multi; submit_vote resta compatibile.
--   · un modello può avere da 1 a 3 domande (non più obbligatoriamente 3).
--
-- Il database conserva le sessioni chiuse e non consente di modificare o
-- cancellare un voto già inviato. Le risposte grezze non sono leggibili dal browser.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.poll_catalog (
  slug text primary key,
  option_counts integer[] not null check (cardinality(option_counts) between 1 and 3),
  title text,
  questions jsonb,
  archived boolean not null default false
);

alter table public.poll_catalog add column if not exists title text;
alter table public.poll_catalog add column if not exists questions jsonb;
alter table public.poll_catalog add column if not exists archived boolean not null default false;

-- Da 1 a 3 domande per modello (prima erano obbligatorie 3).
alter table public.poll_catalog drop constraint if exists poll_catalog_option_counts_check;
alter table public.poll_catalog add constraint poll_catalog_option_counts_check
  check (cardinality(option_counts) between 1 and 3);

-- Nessun modello predefinito: i sondaggi si creano dal pannello di gestione.
-- Se nel database esistono i modelli fissi della versione precedente (Conexa),
-- vengono convertiti in modelli archiviati: spariscono dall'elenco ma lo storico
-- delle loro sessioni resta leggibile. Su un progetto nuovo queste righe non fanno nulla.
update public.poll_catalog set title = 'Apertura · Da dove partiamo?', questions = '[{"text": "Hotel nuovo da 30 camere con SPA, piscina e palestra: da quale impianto partiamo?", "options": ["Termica", "Domotica", "Networking", "Sicurezza"], "multi": false}, {"text": "Chi siete?", "options": ["Progettista o ingegnere", "Installatore", "System integrator", "Committente o gestore", "Altro"], "multi": false}, {"text": "Nel vostro ultimo progetto alberghiero, quanti impianti dialogavano davvero con la supervisione?", "options": ["Nessuno", "1–2", "3–4", "Tutti"], "multi": false}]'::jsonb, archived = true
  where slug = 'inizio' and title is null;
update public.poll_catalog set title = 'Comfort termico · ABB', questions = '[{"text": "Qual è la criticità termica più difficile in un hotel con SPA e piscina?", "options": ["Deumidificazione piscina", "Camere non occupate", "Picchi ACS di SPA e palestra", "Bilanciamento aree comuni"], "multi": false}, {"text": "Regolazione in camera: cosa preferite?", "options": ["Termostato autonomo", "Controller di camera integrato nel BMS", "Gestione dalla reception o dal PMS"], "multi": false}, {"text": "Un BACS in classe B (UNI EN ISO 52120-1) per un hotel nuovo è…", "options": ["Un obbligo da rispettare", "Un investimento che si ripaga", "Un costo difficile da far accettare"], "multi": false}]'::jsonb, archived = true
  where slug = 'comfort-abb' and title is null;
update public.poll_catalog set title = 'Controllo e gestione · MDT Italia', questions = '[{"text": "Rilevazione presenza in camera: quale soluzione vi convince di più?", "options": ["Tasca porta o keycard", "Sensore radar o PIR", "Keycard + sensore", "Stato check-in dal PMS"], "multi": false}, {"text": "Quanto risparmio energetico vi aspettate dalla gestione camera basata sulla presenza?", "options": ["Meno del 10%", "10–20%", "20–30%", "Oltre il 30%"], "multi": false}, {"text": "AI nel building: cosa vi serve di più?", "options": ["Manutenzione predittiva", "Ottimizzazione energetica", "Analisi abitudini ospiti", "Non mi fido ancora"], "multi": false}]'::jsonb, archived = true
  where slug = 'gestione-mdt' and title is null;
update public.poll_catalog set title = 'Connettività · Qubix', questions = '[{"text": "Rete impianti e rete ospiti: come le realizzate?", "options": ["Reti fisicamente separate", "Stessa infrastruttura con VLAN", "Dipende dal budget"], "multi": false}, {"text": "Per un hotel da 30 camere: GPON o rame?", "options": ["GPON", "Rame Cat6A", "Soluzione ibrida", "Non ho esperienza GPON"], "multi": false}, {"text": "Dopo la consegna, chi è responsabile della cybersecurity della rete impianti?", "options": ["Installatore o integratore", "IT del cliente", "Fornitore esterno", "Nessuno di preciso"], "multi": false}]'::jsonb, archived = true
  where slug = 'connettivita-qubix' and title is null;
update public.poll_catalog set title = 'Luci di emergenza · Linergy', questions = '[{"text": "Illuminazione di emergenza: autonoma o centralizzata?", "options": ["Apparecchi autonomi", "Sistema centralizzato", "Dipende dall’edificio"], "multi": false}, {"text": "Come gestite le verifiche periodiche (UNI 11222)?", "options": ["A mano con registro", "Autodiagnosi locale", "Supervisione centralizzata con report"], "multi": false}, {"text": "Segnaletica di esodo dinamica, che cambia direzione in base all’incendio: l’avete mai installata?", "options": ["Sì", "No, ma la valuterei", "No, troppo complessa"], "multi": false}]'::jsonb, archived = true
  where slug = 'emergenza-linergy' and title is null;
update public.poll_catalog set title = 'Termocamere AI · Dahua', questions = '[{"text": "Termocamera AI per la prevenzione incendi: dove la mettete per prima?", "options": ["Centrale termica e locali tecnici", "Cucina e lavanderia", "Sauna e SPA", "Parcheggio e ricarica auto"], "multi": false}, {"text": "Chi deve ricevere l’allarme della termocamera?", "options": ["Centrale rivelazione incendio", "Supervisione o BMS", "Reception via app", "Tutti"], "multi": false}, {"text": "Una termocamera può sostituire la rivelazione incendio tradizionale?", "options": ["Sì", "No, è complementare", "Solo in alcuni ambienti"], "multi": false}]'::jsonb, archived = true
  where slug = 'termocamere-dahua' and title is null;
update public.poll_catalog set title = 'Vigili del Fuoco', questions = '[{"text": "Un hotel da 30 camere è attività soggetta ai controlli VVF?", "options": ["Sì", "No", "Dipende dai posti letto"], "multi": false}, {"text": "Le strutture ricettive si progettano più spesso con…", "options": ["Codice di prevenzione incendi (RTV V.5)", "Regola tecnica tradizionale", "Dipende dal progetto"], "multi": false}, {"text": "Il punto più critico tra impianti di sicurezza e building automation?", "options": ["Responsabilità", "Certificazione", "Manutenzione", "Interfacciamento tecnico"], "multi": false}]'::jsonb, archived = true
  where slug = 'vvf' and title is null;

create table if not exists public.poll_sessions (
  id uuid primary key default gen_random_uuid(),
  poll_slug text not null references public.poll_catalog(slug),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.vote_receipts (
  session_id uuid not null references public.poll_sessions(id),
  participant_id uuid not null,
  submitted_at timestamptz not null default now(),
  answers integer[] check (cardinality(answers) = 3),
  primary key (session_id, participant_id)
);

-- v3: le scelte sono salvate come [[i], [i, j, …], [i]]; "answers" resta per i voti precedenti.
alter table public.vote_receipts add column if not exists selections jsonb;
alter table public.vote_receipts alter column answers drop not null;

create table if not exists public.response_counts (
  session_id uuid not null references public.poll_sessions(id),
  question_index smallint not null check (question_index between 0 and 2),
  option_index smallint not null check (option_index between 0 and 9),
  vote_count bigint not null default 0 check (vote_count >= 0),
  primary key (session_id, question_index, option_index)
);

-- Numero di persone che hanno inviato la votazione (serve per le percentuali
-- delle domande a risposta multipla, dove i voti superano i partecipanti).
create table if not exists public.participant_counts (
  session_id uuid primary key references public.poll_sessions(id),
  participants bigint not null default 0 check (participants >= 0)
);

-- Allinea il contatore per le sessioni votate prima della v3.
insert into public.participant_counts(session_id, participants)
select session_id, count(*) from public.vote_receipts group by session_id
on conflict (session_id) do nothing;

-- Amministratori: solo gli account elencati qui possono gestire sessioni e modelli.
-- Un account creato con la registrazione pubblica di Supabase NON diventa admin.
create table if not exists public.poll_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Gli account già presenti in Authentication al momento dell'esecuzione diventano admin.
-- Per aggiungerne uno in seguito:
--   insert into public.poll_admins(user_id) select id from auth.users where email = 'nome@dominio.it';
insert into public.poll_admins(user_id) select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Funzioni di supporto
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.poll_admins a where a.user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Controllo lato server di un modello personalizzato:
-- da 1 a 3 domande, testo 1–220 caratteri, 2–10 opzioni di 1–120 caratteri,
-- "multi" facoltativo ma, se presente, booleano;
-- option_counts coerente con il numero di opzioni.
create or replace function public.valid_poll_model(p_questions jsonb, p_counts integer[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
  o jsonb;
  i integer := 0;
  n integer;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 3 then
    return false;
  end if;
  if p_counts is null or cardinality(p_counts) <> jsonb_array_length(p_questions) then return false; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    i := i + 1;
    if jsonb_typeof(q) <> 'object' then return false; end if;
    if jsonb_typeof(q->'text') <> 'string' then return false; end if;
    if char_length(btrim(q->>'text')) not between 1 and 220 then return false; end if;
    if q ? 'multi' and jsonb_typeof(q->'multi') <> 'boolean' then return false; end if;
    if jsonb_typeof(q->'options') <> 'array' then return false; end if;
    n := jsonb_array_length(q->'options');
    if n not between 2 and 10 or p_counts[i] is distinct from n then return false; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 120 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

grant execute on function public.valid_poll_model(jsonb, integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.poll_catalog enable row level security;
alter table public.poll_sessions enable row level security;
alter table public.vote_receipts enable row level security;
alter table public.response_counts enable row level security;
alter table public.participant_counts enable row level security;
alter table public.poll_admins enable row level security;

drop policy if exists "catalog is readable" on public.poll_catalog;
create policy "catalog is readable" on public.poll_catalog
  for select to anon, authenticated using (true);

drop policy if exists "admins create poll models" on public.poll_catalog;
create policy "admins create poll models" on public.poll_catalog
  for insert to authenticated
  with check (
    public.is_admin()
    and slug like 'custom-%'
    and char_length(btrim(coalesce(title, ''))) between 1 and 80
    and archived = false
    and public.valid_poll_model(questions, option_counts)
  );

drop policy if exists "admins archive poll models" on public.poll_catalog;
create policy "admins archive poll models" on public.poll_catalog
  for update to authenticated
  using (public.is_admin() and slug like 'custom-%')
  with check (public.is_admin() and slug like 'custom-%');

drop policy if exists "sessions are readable" on public.poll_sessions;
create policy "sessions are readable" on public.poll_sessions
  for select to anon, authenticated using (true);

drop policy if exists "admins create sessions" on public.poll_sessions;
create policy "admins create sessions" on public.poll_sessions
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins close sessions" on public.poll_sessions;
create policy "admins close sessions" on public.poll_sessions
  for update to authenticated
  using (public.is_admin() and status = 'open')
  with check (public.is_admin() and status = 'closed');

drop policy if exists "aggregates are readable" on public.response_counts;
create policy "aggregates are readable" on public.response_counts
  for select to anon, authenticated using (true);

drop policy if exists "participant totals are readable" on public.participant_counts;
create policy "participant totals are readable" on public.participant_counts
  for select to anon, authenticated using (true);

drop policy if exists "admins see own row" on public.poll_admins;
create policy "admins see own row" on public.poll_admins
  for select to authenticated using (user_id = auth.uid());

-- Permessi a livello di colonna
revoke all on public.poll_catalog from anon, authenticated;
grant select on public.poll_catalog to anon, authenticated;
grant insert (slug, option_counts, title, questions) on public.poll_catalog to authenticated;
grant update (archived) on public.poll_catalog to authenticated;

revoke all on public.poll_sessions from anon, authenticated;
grant select on public.poll_sessions to anon, authenticated;
grant insert (poll_slug) on public.poll_sessions to authenticated;
grant update (status, closed_at) on public.poll_sessions to authenticated;

revoke all on public.vote_receipts from anon, authenticated;
revoke all on public.response_counts from anon, authenticated;
grant select on public.response_counts to anon, authenticated;
revoke all on public.participant_counts from anon, authenticated;
grant select on public.participant_counts to anon, authenticated;

revoke all on public.poll_admins from anon, authenticated;
grant select on public.poll_admins to authenticated;

-- ---------------------------------------------------------------------------
-- Invio del voto (unica via di scrittura per il pubblico)
-- ---------------------------------------------------------------------------

-- p_answers: un array di indici per ogni domanda del modello (da 1 a 3), es. [[1], [0, 3], [2]].
-- Una domanda senza "multi": true accetta esattamente un indice.
create or replace function public.submit_vote_multi(p_session_id uuid, p_participant_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_counts integer[];
  poll_questions jsonb;
  current_status text;
  q integer;
  sel jsonb;
  el jsonb;
  idx integer;
  n integer;
  is_multi boolean;
  seen integer[];
  n_questions integer;
begin
  if p_participant_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid vote';
  end if;

  select s.status, c.option_counts, c.questions into current_status, allowed_counts, poll_questions
  from public.poll_sessions s
  join public.poll_catalog c on c.slug = s.poll_slug
  where s.id = p_session_id
  for update of s;

  if current_status is null then raise exception 'Session not found'; end if;
  if current_status <> 'open' then raise exception 'Session is closed'; end if;

  -- Serve una risposta per ciascuna domanda del modello.
  n_questions := cardinality(allowed_counts);
  if jsonb_array_length(p_answers) <> n_questions then raise exception 'Invalid vote'; end if;

  -- Validazione completa prima di scrivere qualsiasi cosa.
  for q in 1..n_questions loop
    sel := p_answers -> (q - 1);
    if jsonb_typeof(sel) <> 'array' then raise exception 'Invalid answer'; end if;
    n := jsonb_array_length(sel);
    is_multi := coalesce(poll_questions -> (q - 1) ->> 'multi', 'false') = 'true';
    if n < 1 or n > allowed_counts[q] or (not is_multi and n <> 1) then
      raise exception 'Invalid answer';
    end if;
    seen := '{}';
    for el in select value from jsonb_array_elements(sel) loop
      if jsonb_typeof(el) <> 'number' then raise exception 'Invalid answer'; end if;
      idx := (el #>> '{}')::integer;
      if idx is null or idx < 0 or idx >= allowed_counts[q] or idx = any(seen) then
        raise exception 'Invalid answer';
      end if;
      seen := seen || idx;
    end loop;
  end loop;

  -- Un secondo invio dallo stesso partecipante viola la chiave primaria e annulla tutto.
  insert into public.vote_receipts(session_id, participant_id, selections)
  values (p_session_id, p_participant_id, p_answers);

  for q in 1..n_questions loop
    for el in select value from jsonb_array_elements(p_answers -> (q - 1)) loop
      insert into public.response_counts(session_id, question_index, option_index, vote_count)
      values (p_session_id, q - 1, (el #>> '{}')::integer, 1)
      on conflict (session_id, question_index, option_index)
      do update set vote_count = public.response_counts.vote_count + 1;
    end loop;
  end loop;

  insert into public.participant_counts(session_id, participants)
  values (p_session_id, 1)
  on conflict (session_id) do update set participants = public.participant_counts.participants + 1;
end;
$$;

revoke execute on function public.submit_vote_multi(uuid, uuid, jsonb) from public;
grant execute on function public.submit_vote_multi(uuid, uuid, jsonb) to anon, authenticated;

-- Compatibilità con pagine partecipante della versione precedente ancora aperte:
-- una risposta per domanda, inoltrata alla nuova funzione.
create or replace function public.submit_vote(p_session_id uuid, p_participant_id uuid, p_answers integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_answers is null or cardinality(p_answers) <> 3
     or p_answers[1] is null or p_answers[2] is null or p_answers[3] is null then
    raise exception 'Invalid vote';
  end if;
  perform public.submit_vote_multi(p_session_id, p_participant_id, jsonb_build_array(
    jsonb_build_array(p_answers[1]), jsonb_build_array(p_answers[2]), jsonb_build_array(p_answers[3])));
end;
$$;

revoke execute on function public.submit_vote(uuid, uuid, integer[]) from public;
grant execute on function public.submit_vote(uuid, uuid, integer[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: i totali aggregati alimentano i grafici live,
-- lo stato sessione segnala la chiusura al pubblico.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.response_counts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_sessions;
exception when duplicate_object then null;
end $$;
