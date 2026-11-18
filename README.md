# Dove la luce incontra il suono · Sondaggi live

Studio Luce e ITS, Gruppo Comet · 20 novembre 2026, ore 17.45 · Studio Luce RemaTarlazzi Macerata.

Sito statico per GitHub Pages, con Supabase come archivio condiviso. Stessa logica della versione Conexa v2, con la grafica dell'invito e la risposta multipla.

## File

- `index.html` + `manager.js`: pannello di gestione (accesso amministratore, creazione modelli, sessioni, QR, risultati live, storico).
- `client.html` + `client.js`: pagina da smartphone aperta dal QR.
- `brand.css`: colori, font Poppins, loghi (incorporati nel file) e sfondo dell'invito.
- `decor-blob.svg`, `decor-ribbon.svg`: decorazioni di sfondo.
- `config.js`: URL e chiave pubblica Supabase.
- `polls.js`: vuoto. I sondaggi si creano dal pannello.
- `database.sql`: schema Supabase v3.

## Aggiornamento dalla v2

1. In Supabase apri **SQL Editor** ed esegui tutto `database.sql`. Lo script è rieseguibile e non cancella sessioni, voti o modelli.
   I vecchi modelli fissi Conexa diventano modelli archiviati: spariscono dall'elenco, il loro storico resta consultabile.
2. Carica sul repository GitHub tutti i file di questa cartella (anche `brand.css` e i due `.svg`), nella radice.

Per un'installazione nuova valgono i passaggi della v2: crea il progetto Supabase, crea l'account amministratore in Authentication e disattiva la registrazione pubblica, esegui `database.sql`, inserisci URL e chiave publishable in `config.js`, pubblica con GitHub Pages.

## Creare un sondaggio

Nel pannello apri **Crea un nuovo modello**: titolo e da 1 a 3 domande, da 2 a 10 opzioni ciascuna (una per riga). Le domande lasciate vuote vengono ignorate.
Sotto ogni domanda l'interruttore **Consenti più risposte** abilita la scelta multipla per quella domanda; le altre restano a scelta singola.
**Crea e avvia** salva il modello e apre subito una sessione con il suo QR.

## Risposta multipla

- Sul telefono la domanda mostra caselle quadrate e la nota "Puoi scegliere più risposte"; serve almeno una scelta per proseguire.
- Il database controlla che una domanda singola riceva esattamente una risposta e che le scelte multiple siano valide e non ripetute.
- Nei risultati le percentuali delle domande multiple sono calcolate sul numero di partecipanti, quindi la somma può superare il 100%. Le domande singole restano sul totale dei voti.
- Il numero di partecipanti è conservato nella tabella `participant_counts`.

## Amministratori

Solo gli account presenti in `poll_admins` possono avviare e chiudere sessioni e creare o togliere modelli. Per aggiungerne uno:

```sql
insert into public.poll_admins(user_id)
select id from auth.users where email = 'nome@dominio.it';
```

## Regole dei voti

Le scelte restano sul dispositivo finché il partecipante non preme **Invia le risposte**; fino ad allora può tornare indietro e cambiarle. L'invio è atomico, un secondo invio dallo stesso dispositivo viene rifiutato e i voti inviati non si possono modificare né cancellare. Le risposte singole non sono leggibili dal browser: il pubblico vede solo i totali.

## Storico

Chiudendo una sessione si bloccano nuovi invii; sessione e risultati restano nell'elenco storico.
