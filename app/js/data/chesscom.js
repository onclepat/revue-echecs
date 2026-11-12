/**
 * API publique de Chess.com : liste des mois joués, puis parties d'un mois.
 * Une requête à la fois (recommandation de Chess.com). Chaque partie est validée et réduite aux champs utiles.
 */
const API = "https://api.chess.com/pub/player/";
const FORMAT_CHANGED = "Chess.com a changé le format de ses données : import interrompu.";
const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
const HOW = {
  checkmated: "mat",
  resigned: "abandon",
  timeout: "temps",
  abandoned: "partie quittée",
  agreed: "nulle par accord",
  repetition: "nulle par répétition",
  stalemate: "pat",
  insufficient: "matériel insuffisant",
  "50move": "règle des 50 coups",
  timevsinsufficient: "temps contre matériel insuffisant",
};

async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Chess.com est injoignable. Vérifiez votre connexion.");
  }
  if (response.status === 404) throw new Error("Pseudo introuvable sur Chess.com.");
  if (response.status === 429) throw new Error("Chess.com limite les requêtes. Réessayez dans une minute.");
  if (!response.ok) throw new Error(`Chess.com a répondu ${response.status}. Réessayez plus tard.`);
  return response.json();
}

/** Nom d'ouverture lisible à partir de l'adresse fournie par Chess.com. */
function openingName(eco) {
  if (!eco) return "";
  let words = decodeURIComponent(eco.split("/").pop()).split("-");
  const cut = words.findIndex((word) => /^\d/.test(word));
  if (cut > 0) words = words.slice(0, cut);
  return words.join(" ");
}

/**
 * Cadence lisible et durée de tri à partir du champ time_control de Chess.com.
 * « 600 » → 10 min ; « 180+2 » → 3 min + 2 s ; « 1/86400 » → 1 jour par coup.
 * @returns {{label:string, seconds:number}} seconds sert à ordonner les cadences, de la plus rapide à la plus lente
 */
export function cadenceOf(timeControl) {
  const text = String(timeControl || "");
  const duration = (seconds) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);
  const daily = text.match(/^1\/(\d+)$/);
  if (daily) {
    const days = +daily[1] / 86400;
    return { label: `${days} jour${days > 1 ? "s" : ""} par coup`, seconds: +daily[1] * 40 };
  }
  const live = text.match(/^(\d+)(?:\+(\d+))?$/);
  if (!live) return { label: text || "cadence inconnue", seconds: Number.MAX_SAFE_INTEGER };
  const base = +live[1];
  const increment = +(live[2] || 0);
  return { label: duration(base) + (increment ? ` + ${increment} s` : ""), seconds: base + increment * 40 };
}

/**
 * Réduit une partie Chess.com. Toutes les cadences sont conservées.
 * @returns {object|null} null si la partie est une variante (les règles diffèrent des échecs classiques)
 * @throws si le format des données est inattendu
 */
export function normalise(raw, user, month) {
  if (raw.rules !== "chess" || !raw.pgn) return null;
  const cadence = cadenceOf(raw.time_control);
  const white = raw.white;
  const black = raw.black;
  if (!white?.username || !black?.username || !raw.url || !raw.end_time) throw new Error(FORMAT_CHANGED);
  const me = white.username.toLowerCase() === user ? "w" : "b";
  const mine = me === "w" ? white : black;
  const opponent = me === "w" ? black : white;
  const result = mine.result === "win" ? "win" : DRAWS.has(mine.result) ? "draw" : "loss";
  return {
    url: raw.url,
    user,
    month,
    endTime: raw.end_time,
    timeControl: raw.time_control,
    cadence: cadence.label,
    cadenceSeconds: cadence.seconds,
    me,
    myRating: mine.rating,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    result,
    how: HOW[result === "win" ? opponent.result : mine.result] || "",
    opening: openingName(raw.eco),
    pgn: raw.pgn,
  };
}

/** Mois où le joueur a des parties, du plus récent au plus ancien, au format « AAAA/MM ». */
export async function fetchArchives(user) {
  const index = await getJson(`${API}${encodeURIComponent(user)}/games/archives`);
  if (!Array.isArray(index.archives)) throw new Error(FORMAT_CHANGED);
  return index.archives
    .map((url) => url.match(/(\d{4}\/\d{2})$/)?.[1])
    .filter(Boolean)
    .sort()
    .reverse();
}

/** Parties d'un mois, toutes cadences confondues. */
export async function fetchMonth(user, month) {
  const data = await getJson(`${API}${encodeURIComponent(user)}/games/${month}`);
  if (!Array.isArray(data.games)) throw new Error(FORMAT_CHANGED);
  return data.games.map((raw) => normalise(raw, user, month)).filter(Boolean);
}
