import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { POLLS } from './polls.js';

const $ = (id) => document.getElementById(id);
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
// Ogni domanda è [testo, opzioni, multipla]: il terzo valore abilita la risposta multipla.
const FIXED = POLLS.map(p => ({ ...p, questions: p.questions.map(q => [q[0], q[1], q[2] === true]) }));
let db, sessions = [], customPolls = [], selected = null, channel = null, toastTimer;
let currentUserId = null, isAdmin = false, refreshTimer = null, refreshing = false, refreshAgain = false;

renderQuestionBuilder();
renderPollChoices();
if (!configured) {
  $('setupNotice').classList.remove('hidden');
  $('login').classList.add('hidden');
  $('createSession').disabled = true;
} else {
  $('setupNotice').classList.add('hidden');
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  boot();
}

// ---------------------------------------------------------------------------
// Accesso
// ---------------------------------------------------------------------------

async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) showAdmin(session.user); else $('login').classList.remove('hidden');
  db.auth.onAuthStateChange((_event, session) => {
    if (session) showAdmin(session.user);
    else {
      currentUserId = null; isAdmin = false;
      $('login').classList.remove('hidden'); $('logout').classList.add('hidden'); $('adminEmail').textContent = '';
      $('adminNotice').classList.add('hidden');
    }
  });
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('loginButton').disabled = true; $('loginError').textContent = '';
  const { data, error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
  $('loginButton').disabled = false;
  if (error) $('loginError').textContent = 'Accesso non riuscito. Controlla email e password.';
  else showAdmin(data.user);
});
$('logout').onclick = () => db.auth.signOut();

async function showAdmin(user) {
  // onAuthStateChange scatta anche al rinnovo del token: ricarica solo al cambio utente.
  if (currentUserId === user.id) return;
  currentUserId = user.id;
  $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
  $('adminEmail').textContent = user.email || 'Amministratore';
  const { data, error } = await db.rpc('is_admin');
  isAdmin = !error && data === true;
  applyAdminState(error);
  await loadCustomPolls();
  await refreshSessions();
}

function applyAdminState(error) {
  const notice = $('adminNotice');
  if (isAdmin) { notice.classList.add('hidden'); }
  else {
    notice.textContent = error
      ? 'Database da aggiornare: esegui di nuovo database.sql in Supabase per abilitare la gestione.'
      : 'Questo account può vedere lo storico ma non gestire sessioni e modelli. Aggiungilo a poll_admins in Supabase (vedi README).';
    notice.classList.remove('hidden');
  }
  ['saveCustomPoll', 'archivePoll'].forEach(id => { $(id).disabled = !isAdmin; });
  updateCreateState();
}

// ---------------------------------------------------------------------------
// Modelli di sondaggio
// ---------------------------------------------------------------------------

function toPoll(row) {
  return { slug: row.slug, name: row.title, archived: !!row.archived, custom: true,
    questions: (row.questions || []).map(q => [q.text, q.options, q.multi === true]) };
}

function availablePolls() { return [...FIXED, ...customPolls.filter(p => !p.archived)]; }

function renderPollChoices() {
  const keep = $('pollChoice').value;
  const available = availablePolls();
  $('pollChoice').innerHTML = available.length
    ? available.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')
    : '<option value="">Nessun modello: creane uno qui sotto</option>';
  $('pollChoice').disabled = !available.length;
  if (keep && available.some(p => p.slug === keep)) $('pollChoice').value = keep;
  updateArchiveButton();
  updateCreateState();
}

function updateCreateState() {
  $('createSession').disabled = !configured || !isAdmin || !$('pollChoice').value;
}

function updateArchiveButton() {
  const isCustom = customPolls.some(p => p.slug === $('pollChoice').value);
  $('archivePoll').classList.toggle('hidden', !isCustom);
}
$('pollChoice').addEventListener('change', () => { updateArchiveButton(); updateCreateState(); });

function renderQuestionBuilder() {
  $('questionBuilder').innerHTML = [0,1,2].map(i => `<div class="question-block"><strong>Domanda ${i+1}${i ? ' <small>(facoltativa)</small>' : ''}</strong><label for="customQuestion${i}">Testo della domanda</label><textarea id="customQuestion${i}" maxlength="220" placeholder="Scrivi la domanda"></textarea><label for="customOptions${i}">Opzioni, una per riga (max 120 caratteri)</label><textarea id="customOptions${i}" placeholder="Opzione 1&#10;Opzione 2&#10;Opzione 3"></textarea><label class="multi-toggle"><input type="checkbox" id="customMulti${i}"> Consenti più risposte</label></div>`).join('');
}

async function loadCustomPolls() {
  const { data, error } = await db.from('poll_catalog').select('slug,title,questions,archived').not('title','is',null).order('title');
  if (error) { toast('Modelli non caricati. Esegui di nuovo database.sql.'); customPolls = []; }
  else customPolls = (data || []).map(toPoll);
  renderPollChoices();
  // Nessun modello disponibile: apri subito il modulo di creazione.
  if (!availablePolls().length) $('builder').open = true;
}

async function getPoll(slug) {
  const fixed = FIXED.find(p => p.slug === slug);
  if (fixed) return fixed;
  const cached = customPolls.find(p => p.slug === slug);
  if (cached) return cached;
  const { data } = await db.from('poll_catalog').select('slug,title,questions,archived').eq('slug', slug).single();
  if (!data?.title) return null;
  const poll = toPoll(data); customPolls.push(poll);
  return poll;
}

$('saveCustomPoll').onclick = createCustomPoll;
async function createCustomPoll() {
  if (!isAdmin) return;
  const title = $('newPollTitle').value.trim();
  // Da 1 a 3 domande: i blocchi lasciati completamente vuoti vengono ignorati.
  const filled = [0,1,2].map(i => ({
    n: i + 1,
    text: $(`customQuestion${i}`).value.trim(),
    options: $(`customOptions${i}`).value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    multi: $(`customMulti${i}`).checked
  })).filter(q => q.text || q.options.length);
  if (!title) return setBuilderStatus('Inserisci il titolo del sondaggio.');
  if (!filled.length) return setBuilderStatus('Inserisci almeno una domanda.');
  const invalid = filled.find(q => !q.text || q.options.length < 2 || q.options.length > 10);
  if (invalid) return setBuilderStatus(`Completa la domanda ${invalid.n} con 2–10 opzioni.`);
  const long = filled.find(q => q.options.some(o => o.length > 120));
  if (long) return setBuilderStatus(`Domanda ${long.n}: ogni opzione deve stare entro 120 caratteri.`);
  const dup = filled.find(q => new Set(q.options.map(o => o.toLowerCase())).size !== q.options.length);
  if (dup) return setBuilderStatus(`Domanda ${dup.n}: ci sono opzioni ripetute.`);
  const questions = filled.map(({ text, options, multi }) => ({ text, options, multi }));
  $('saveCustomPoll').disabled = true; setBuilderStatus('Salvataggio…');
  const slug = `custom-${crypto.randomUUID().replaceAll('-','')}`;
  const { error } = await db.from('poll_catalog').insert({
    slug, title, questions,
    option_counts: questions.map(q => q.options.length)
  });
  $('saveCustomPoll').disabled = false;
  if (error) return setBuilderStatus('Salvataggio non riuscito. Verifica i permessi di amministratore e di aver eseguito il nuovo database.sql.');
  await loadCustomPolls(); $('pollChoice').value = slug; updateArchiveButton(); updateCreateState();
  const { data: session, error: sessionError } = await db.from('poll_sessions').insert({ poll_slug: slug }).select('id,poll_slug,status,created_at,closed_at').single();
  if (sessionError) { setBuilderStatus('Modello salvato. Premi “Avvia sessione” per creare il QR.'); toast('Modello salvato, avvio sessione non riuscito.'); return; }
  selected = session; $('newPollTitle').value = ''; renderQuestionBuilder(); setBuilderStatus('Modello salvato e sessione avviata.');
  await refreshSessions(); toast('Sondaggio creato. Il QR è pronto.');
}
function setBuilderStatus(message) { $('builderStatus').textContent = message; }

$('archivePoll').onclick = async () => {
  if (!isAdmin) return;
  const poll = customPolls.find(p => p.slug === $('pollChoice').value);
  if (!poll) return;
  if (!confirm(`Togliere “${poll.name}” dall’elenco dei modelli? Sessioni e risultati già raccolti restano nello storico.`)) return;
  const { error } = await db.from('poll_catalog').update({ archived: true }).eq('slug', poll.slug);
  if (error) { toast('Non riesco a togliere il modello. Verifica i permessi.'); return; }
  poll.archived = true; renderPollChoices(); toast('Modello tolto dall’elenco.');
};

// ---------------------------------------------------------------------------
// Sessioni
// ---------------------------------------------------------------------------

async function refreshSessions() {
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try {
    const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at').order('created_at', { ascending: false });
    if (error) { toast('Non riesco a caricare le sessioni. Controlla database.sql e i permessi.'); return; }
    sessions = data || []; $('sessionNumber').textContent = sessions.length;
    const all = [...FIXED, ...customPolls];
    $('sessionList').innerHTML = sessions.length ? sessions.map(s => {
      const poll = all.find(p => p.slug === s.poll_slug);
      return `<button type="button" class="session ${selected?.id === s.id ? 'active' : ''}" data-id="${s.id}"><span class="status ${s.status === 'closed' ? 'closed' : ''}">${s.status === 'open' ? '● In corso' : 'Archiviata'}</span><strong>${esc(poll?.name || s.poll_slug)}</strong><small>${new Date(s.created_at).toLocaleString('it-IT')}</small></button>`;
    }).join('') : '<div class="empty">Nessuna sessione ancora. Crea un modello e avvialo dal pannello a destra.</div>';
    document.querySelectorAll('.session').forEach(b => b.onclick = () => selectSession(sessions.find(s => s.id === b.dataset.id)));
    if (selected) selected = sessions.find(s => s.id === selected.id) || null;
    if (selected) await renderSession();
    else { stopChannel(); $('sessionView').innerHTML = '<div class="empty">Seleziona una sessione nello storico o avviane una nuova.</div>'; renderQR(null); }
  } finally {
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; refreshSessions(); }
  }
}

$('createSession').onclick = async () => {
  if (!isAdmin || !$('pollChoice').value) return;
  $('createSession').disabled = true;
  const { data, error } = await db.from('poll_sessions').insert({ poll_slug: $('pollChoice').value }).select('id,poll_slug,status,created_at,closed_at').single();
  updateCreateState();
  if (error) { toast('Creazione non riuscita. Verifica i permessi di amministratore.'); return; }
  selected = data; await refreshSessions(); toast('Sessione avviata. Il QR è pronto.');
};

function selectSession(session) { selected = session; refreshSessions(); }

function stopChannel() { if (channel) { db.removeChannel(channel); channel = null; } clearTimeout(refreshTimer); refreshTimer = null; }

async function readCounts(sessionId) {
  const [counts, people] = await Promise.all([
    db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', sessionId),
    db.from('participant_counts').select('participants').eq('session_id', sessionId).maybeSingle()
  ]);
  return { rows: counts.data || [], error: counts.error, participants: people.data ? Number(people.data.participants) : null };
}

// Partecipanti: dal contatore dedicato; per sessioni molto vecchie senza contatore, il massimo dei voti per domanda.
function participantTotal(rows, participants) {
  if (participants !== null) return participants;
  return Math.max(0, ...[0,1,2].map(q => rows.filter(r => r.question_index === q).reduce((n, r) => n + Number(r.vote_count), 0)));
}

async function renderSession() {
  if (!selected) return;
  const session = selected, poll = await getPoll(session.poll_slug);
  stopChannel();
  if (!poll) { $('sessionView').innerHTML = '<div class="empty">Modello del sondaggio non trovato.</div>'; renderQR(session); return; }
  const { rows, error, participants } = await readCounts(session.id);
  if (error) { toast('Non riesco a leggere i risultati aggregati.'); return; }
  $('sessionView').innerHTML = sessionMarkup(session, poll, rows, participantTotal(rows, participants));
  $('closeSession')?.addEventListener('click', closeSession);
  renderQR(session);
  if (session.status === 'open') {
    channel = db.channel(`session-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${session.id}` }, scheduleRefresh)
      .subscribe();
  }
}

// Durante una raffica di voti aggiorna al massimo una volta ogni 800 ms.
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => { refreshTimer = null; await refreshSessionView(); }, 800);
}

async function refreshSessionView() {
  const currentId = selected?.id;
  if (!currentId) return;
  const { rows, error, participants } = await readCounts(currentId);
  if (error || selected?.id !== currentId) return;
  const poll = await getPoll(selected.poll_slug);
  if (!poll) return;
  const people = participantTotal(rows, participants);
  const answers = new Map(rows.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  if ($('responsesTotal')) $('responsesTotal').textContent = people.toLocaleString('it-IT');
  if ($('questions')) $('questions').innerHTML = poll.questions.map((q, qi) => questionMarkup(q, qi, answers, people)).join('');
}

function sessionMarkup(session, poll, rows, people) {
  const answers = new Map(rows.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  const multiCount = poll.questions.filter(q => q[2]).length;
  return `<div class="session-title"><div><h2>${esc(poll.name)}</h2><p>Avviata il ${new Date(session.created_at).toLocaleString('it-IT')}, codice ${session.id.slice(0,8)}${session.closed_at ? `, chiusa il ${new Date(session.closed_at).toLocaleString('it-IT')}` : ''}</p></div><span class="state ${session.status === 'closed' ? 'closed' : ''}">${session.status === 'open' ? '● In corso' : 'Archiviata'}</span></div>
    <div class="stats"><div class="stat"><strong id="responsesTotal">${people.toLocaleString('it-IT')}</strong><span>partecipanti</span></div><div class="stat"><strong>${poll.questions.length}</strong><span>${poll.questions.length === 1 ? 'domanda' : 'domande'}</span></div><div class="stat"><strong>${multiCount}</strong><span>a risposta multipla</span></div></div>
    ${session.status === 'open' && isAdmin ? '<div class="close-row"><button type="button" class="btn danger" id="closeSession">Chiudi e archivia sessione</button></div>' : ''}
    <div class="questions" id="questions">${poll.questions.map((q,qi)=>questionMarkup(q,qi,answers,people)).join('')}</div>`;
}

function questionMarkup(q, qi, counts, people) {
  const multi = q[2] === true;
  const vals = q[1].map((_, oi) => counts.get(`${qi}-${oi}`) || 0);
  const selections = vals.reduce((a,b)=>a+b,0);
  // Scelta singola: percentuale sul totale dei voti. Multipla: sul numero di partecipanti.
  const base = multi ? (people || selections) : selections;
  const meta = multi
    ? `<b>Risposta multipla</b>, ${selections.toLocaleString('it-IT')} scelte in totale; percentuali sui partecipanti`
    : `Risposta singola, ${selections.toLocaleString('it-IT')} voti`;
  return `<article class="qrow"><h3>${qi+1}. ${esc(q[0])}</h3><p class="qmeta">${meta}</p><div class="bars">${q[1].map((option,oi)=>{const pct=base?Math.round(vals[oi]/base*100):0;return `<div class="barrow"><span class="barlabel" title="${esc(option)}">${esc(option)}</span><span class="track"><span class="fill" style="width:${Math.min(pct,100)}%"></span></span><span class="pct"><b>${pct}%</b> · ${vals[oi]}</span></div>`}).join('')}</div></article>`;
}

async function closeSession() {
  if (!selected || !isAdmin) return;
  if (!confirm('Chiudere la sessione? Non saranno più accettati voti.')) return;
  const { error } = await db.from('poll_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', selected.id);
  if (error) { toast('Non riesco ad archiviare la sessione.'); return; }
  toast('Sessione chiusa e archiviata.'); await refreshSessions();
}

async function renderQR(session) {
  const area = $('qrArea');
  if (!session) { area.innerHTML = '<span class="qr-placeholder">QR sessione</span>'; $('qrHint').textContent = 'Seleziona una sessione per mostrare il QR code.'; $('clientLink').textContent = ''; return; }
  const url = new URL('./client.html', location.href); url.searchParams.set('session', session.id);
  $('qrHint').textContent = session.status === 'open' ? 'Inquadra questo QR con lo smartphone per votare.' : 'Sessione chiusa: il QR apre i risultati finali.';
  $('clientLink').innerHTML = `<a href="${esc(url.href)}" target="_blank" rel="noopener">Apri pagina partecipante ↗</a>`;
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url.href, { width: 164, margin: 1, color: { dark: '#0a1d3a', light: '#ffffff' } });
    area.innerHTML = ''; area.appendChild(canvas);
  } catch { area.innerHTML = '<span class="qr-placeholder">QR non disponibile</span>'; }
}

function esc(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600); }
