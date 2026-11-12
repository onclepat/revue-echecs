/**
 * Stockage local : parties, mois chargés et analyses dans IndexedDB (base du navigateur), préférences dans localStorage.
 * Toute erreur de stockage remonte à l'appelant : rien n'est avalé en silence.
 */
const DB_NAME = "revue";
const DB_VERSION = 2;

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore("games", { keyPath: "url" });
        db.createObjectStore("analyses", { keyPath: "key" });
      }
      if (event.oldVersion < 2) {
        // Version 2 : historique complet, rangé par mois.
        const games = request.transaction.objectStore("games");
        if (games.indexNames.contains("user")) games.deleteIndex("user");
        games.clear();
        games.createIndex("userMonth", ["user", "month"]);
        db.createObjectStore("months", { keyPath: ["user", "month"] });
        db.createObjectStore("archives", { keyPath: "user" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Stockage local indisponible : " + request.error?.message));
  });
  return opening;
}

async function run(storeName, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(new Error("Écriture locale impossible : " + transaction.error?.message));
  });
}

export function saveGames(games) {
  return run("games", "readwrite", (store) => {
    games.forEach((game) => store.put(game));
  });
}

/** Parties d'un joueur pour un mois « AAAA/MM », de la plus récente à la plus ancienne. */
export async function loadGames(user, month) {
  const games = await run("games", "readonly", (store) => store.index("userMonth").getAll([user, month]));
  return games.sort((a, b) => b.endTime - a.endTime);
}

/** Enregistre qu'un mois a été chargé. `complete` : le mois est terminé, il ne sera plus redemandé. */
export function saveMonth(record) {
  return run("months", "readwrite", (store) => store.put(record));
}

export function loadMonth(user, month) {
  return run("months", "readonly", (store) => store.get([user, month]));
}

export function saveArchives(user, months) {
  return run("archives", "readwrite", (store) => store.put({ user, months }));
}

export async function loadArchives(user) {
  return (await run("archives", "readonly", (store) => store.get(user)))?.months ?? null;
}

export function saveAnalysis(key, analysis) {
  return run("analyses", "readwrite", (store) => store.put({ key, ...analysis }));
}

export function loadAnalysis(key) {
  return run("analyses", "readonly", (store) => store.get(key));
}

/** Demande au navigateur de ne pas effacer les données (utile sur iPhone, application installée). */
export function requestPersistence() {
  return navigator.storage?.persist?.() ?? Promise.resolve(false);
}

export const preferences = {
  get(name, fallback) {
    try {
      const value = localStorage.getItem("revue." + name);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem("revue." + name, JSON.stringify(value));
    } catch {
      // Préférence non mémorisée (navigation privée) : sans conséquence sur les données.
    }
  },
};
