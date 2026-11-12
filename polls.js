// Nessun modello predefinito: i sondaggi si creano dal pannello di gestione
// (“Crea un nuovo modello”) e vengono salvati nel database.
// Formato di un modello fisso, se un giorno servisse:
//   { name:'Titolo', slug:'slug-univoco', questions:[ ['Domanda', ['Opzione A','Opzione B'], false], … ] }
// Il terzo valore di ogni domanda (true/false) abilita la risposta multipla.
export const POLLS = [];
