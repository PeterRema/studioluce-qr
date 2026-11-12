import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { POLLS } from './polls.js';

const $ = id => document.getElementById(id);
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
const sessionId = new URLSearchParams(location.search).get('session');
// choices[q] è sempre un array di indici: un solo elemento per le domande a scelta singola.
let db, session, poll, step = 0, choices = [[], [], []], participantId, liveChannel, saving = false, resultsTimer = null;
const draftKey = `conexa-draft-${sessionId}`, voteKey = `conexa-vote-${sessionId}`;

start();

async function start() {
  if (!configured) return fatal('Il sondaggio non è ancora configurato.');
  if (!sessionId) return fatal('Apri il link o inquadra il QR del sondaggio per partecipare.');
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status').eq('id', sessionId).single();
  if (error || !data) return fatal('Questa sessione non è disponibile. Chiedi all’organizzatore un nuovo QR code.');
  session = data;
  const fixed = POLLS.find(item => item.slug === session.poll_slug);
  if (fixed) poll = { ...fixed, questions: fixed.questions.map(q => [q[0], q[1], q[2] === true]) };
  if (!poll) {
    const { data: custom } = await db.from('poll_catalog').select('slug,title,questions').eq('slug', session.poll_slug).single();
    if (custom?.title && Array.isArray(custom.questions) && custom.questions.length === 3
        && custom.questions.every(q => typeof q?.text === 'string' && Array.isArray(q.options))) {
      poll = { slug: custom.slug, name: custom.title, questions: custom.questions.map(q => [q.text, q.options, q.multi === true]) };
    }
  }
  if (!poll) return fatal('Non riconosco questo sondaggio.');
  $('headline').textContent = poll.name;
  document.title = `${poll.name} · Partecipa`;
  $('lead').textContent = 'Puoi rivedere e cambiare le tue scelte prima di inviare.';
  participantId = localStorage.getItem(`conexa-participant-${sessionId}`);
  if (!participantId) { participantId = crypto.randomUUID(); localStorage.setItem(`conexa-participant-${sessionId}`, participantId); }
  const storedVote = safeParse(localStorage.getItem(voteKey));
  const storedDraft = normalizeChoices(safeParse(localStorage.getItem(draftKey)));
  if (storedVote?.submitted) {
    choices = normalizeChoices(storedVote.answers) || [[], [], []];
    await showFinal(true);
  } else if (session.status === 'closed') {
    if (storedDraft) choices = storedDraft;
    await showFinal(false);
  } else {
    if (storedDraft) choices = storedDraft;
    renderQuestion();
  }
  liveChannel = db.channel(`client-${sessionId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'response_counts', filter:`session_id=eq.${sessionId}` }, scheduleResults)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'poll_sessions', filter:`id=eq.${sessionId}` }, async payload => {
      session.status = payload.new.status;
      if (session.status === 'closed' && !$('report').classList.contains('hidden')) return;
      if (session.status === 'closed' && !$('questionCard').classList.contains('hidden')) {
        $('questionCard').classList.add('hidden'); $('progressBox').classList.add('hidden');
        $('headline').textContent = 'Sessione conclusa'; $('lead').textContent = 'Il sondaggio è stato chiuso dall’organizzatore. Ecco i risultati della sala.';
        await showFinal(false);
      }
    }).subscribe();
}

// Accetta sia il formato attuale ([[0],[1,3],[2]]) sia quello precedente ([0,1,2]).
function normalizeChoices(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  return value.map(item => Array.isArray(item) ? item.filter(Number.isInteger) : Number.isInteger(item) ? [item] : []);
}

const isMulti = index => poll.questions[index][2] === true;

function renderQuestion() {
  const q = poll.questions[step], multi = isMulti(step);
  $('progressBox').classList.remove('hidden'); $('questionCard').classList.remove('hidden');
  $('thanks').classList.add('hidden'); $('report').classList.add('hidden');
  $('stepNum').textContent = String(step + 1);
  $('progressFill').style.width = `${((step + 1) / 3) * 100}%`;
  $('question').textContent = q[0];
  $('mode').textContent = multi ? 'Puoi scegliere più risposte.' : 'Scegli una risposta.';
  $('answers').classList.toggle('multi', multi);
  $('answers').setAttribute('role', multi ? 'group' : 'radiogroup');
  $('answers').setAttribute('aria-labelledby', 'question');
  $('answers').innerHTML = q[1].map((answer, index) => {
    const on = choices[step].includes(index);
    return `<button type="button" class="answer" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" data-index="${index}"><span class="mark" aria-hidden="true"></span><span class="answer-text">${escapeHtml(answer)}</span></button>`;
  }).join('');
  document.querySelectorAll('.answer').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.index);
    if (multi) {
      const set = new Set(choices[step]);
      set.has(index) ? set.delete(index) : set.add(index);
      choices[step] = [...set].sort((a, b) => a - b);
    } else {
      choices[step] = [index];
    }
    localStorage.setItem(draftKey, JSON.stringify(choices));
    renderQuestion();
    document.querySelector(`.answer[data-index="${index}"]`)?.focus();
  });
  $('previous').disabled = step === 0;
  $('previous').onclick = () => { if (step > 0) { step--; renderQuestion(); } };
  $('continue').disabled = choices[step].length === 0 || saving;
  $('continue').textContent = step === 2 ? (saving ? 'Invio…' : 'Invia le risposte') : 'Continua';
  $('continue').onclick = step === 2 ? submitVote : () => { if (choices[step].length) { step++; renderQuestion(); } };
}

async function submitVote() {
  if (saving || choices.some(list => !list.length)) return;
  saving = true; renderQuestion();
  const { error } = await db.rpc('submit_vote_multi', { p_session_id: sessionId, p_participant_id: participantId, p_answers: choices });
  saving = false;
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('duplicate') || message.includes('unique')) {
      localStorage.setItem(voteKey, JSON.stringify({ submitted:true, answers:choices }));
      localStorage.removeItem(draftKey); await showFinal(true); return;
    }
    if (message.includes('closed')) { session.status='closed'; $('questionCard').classList.add('hidden'); $('progressBox').classList.add('hidden'); $('headline').textContent='Sessione conclusa'; $('lead').textContent='Il sondaggio è stato chiuso dall’organizzatore.'; await showFinal(false); return; }
    renderQuestion(); toast('Invio non riuscito. Controlla la connessione e riprova.'); return;
  }
  localStorage.setItem(voteKey, JSON.stringify({ submitted:true, answers:choices }));
  localStorage.removeItem(draftKey);
  await showFinal(true); confetti();
}

async function showFinal(received) {
  $('progressBox').classList.add('hidden'); $('questionCard').classList.add('hidden');
  $('thanks').classList.toggle('hidden', !received); $('report').classList.remove('hidden');
  if (!received) { $('headline').textContent = 'Risultati della sala'; $('lead').textContent = 'Ecco come ha risposto il pubblico.'; }
  $('privacy').textContent = 'Risultati aggregati, aggiornati in tempo reale';
  await loadResults();
}

// Con molti telefoni in sala ogni voto arriva a tutti: si raggruppano gli aggiornamenti
// e si distribuiscono nel tempo (0,8–2 s) per non far rileggere il database a tutti insieme.
function scheduleResults() {
  if (resultsTimer || $('report').classList.contains('hidden')) return;
  resultsTimer = setTimeout(async () => { resultsTimer = null; await loadResults(); }, 800 + Math.random() * 1200);
}

async function loadResults() {
  if (!db || !poll) return;
  const [{ data, error }, { data: people }] = await Promise.all([
    db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', sessionId),
    db.from('participant_counts').select('participants').eq('session_id', sessionId).maybeSingle()
  ]);
  if (error) { $('reports').innerHTML = '<p class="lead">Risultati temporaneamente non disponibili.</p>'; return; }
  const counts = poll.questions.map(q => q[1].map(() => 0));
  (data || []).forEach(row => { if (counts[row.question_index]?.[row.option_index] !== undefined) counts[row.question_index][row.option_index] = Number(row.vote_count); });
  const participants = Number(people?.participants || 0);
  $('reports').innerHTML = poll.questions.map((question, qIndex) => {
    const multi = question[2] === true;
    const selections = counts[qIndex].reduce((sum, n) => sum + n, 0);
    // Scelta singola: percentuale sul totale dei voti. Multipla: sul numero di partecipanti.
    const base = multi ? (participants || selections) : selections;
    const meta = multi
      ? `${participants.toLocaleString('it-IT')} partecipanti · più risposte possibili, i totali possono superare il 100%`
      : `${selections.toLocaleString('it-IT')} risposte`;
    return `<section class="report-question"><h4>${qIndex + 1}. ${escapeHtml(question[0])}</h4><p class="report-meta">${meta}</p><div class="results">${question[1].map((option, optionIndex) => {
      const pct = base ? Math.round(counts[qIndex][optionIndex] / base * 100) : 0;
      const mine = choices[qIndex]?.includes(optionIndex);
      return `<div class="result-row ${mine ? 'mine' : ''}"><div class="result-label">${escapeHtml(option)}${mine ? '<span class="mine-tag">la tua scelta</span>' : ''}</div><div class="result-pct">${pct}%</div><div class="result-track"><div class="result-fill" style="width:${Math.min(pct, 100)}%"></div></div></div>`;
    }).join('')}</div></section>`;
  }).join('');
  $('updated').textContent = 'Aggiornato adesso';
}

function fatal(message) {
  $('progressBox').classList.add('hidden'); $('questionCard').classList.add('hidden');
  $('headline').textContent = 'Dove la luce incontra il suono'; $('lead').textContent = message;
  $('privacy').textContent = 'Studio Luce e ITS, Gruppo Comet';
}
function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2500); }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#c39a80', '#e2c3ad', '#ffffff', '#1450a8'];
  $('confetti').innerHTML = Array.from({ length: 44 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .7}s"></i>`).join('');
  setTimeout(() => $('confetti').innerHTML = '', 3500);
}
