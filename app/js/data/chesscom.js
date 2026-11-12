/**
 * Import des parties depuis l'API publique de Chess.com.
 * Requêtes en série (recommandation de Chess.com). Chaque partie est validée et réduite aux champs utiles.
 */
const API = "https://api.chess.com/pub/player/";
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

/** Réduit une partie Chess.com. Renvoie null si elle est hors périmètre, lève une erreur si son format est inattendu. */
export function normalise(raw, user, baseTimes) {
  if (raw.rules !== "chess" || !raw.pgn) return null;
  const base = String(raw.time_control || "").split("+")[0];
  if (!baseTimes.includes(base)) return null;
  const white = raw.white;
  const black = raw.black;
  if (!white?.username || !black?.username || !raw.url || !raw.end_time) {
    throw new Error("Chess.com a changé le format de ses données : import interrompu.");
  }
  const me = white.username.toLowerCase() === user ? "w" : "b";
  const mine = me === "w" ? white : black;
  const opponent = me === "w" ? black : white;
  const result = mine.result === "win" ? "win" : DRAWS.has(mine.result) ? "draw" : "loss";
  return {
    url: raw.url,
    user,
    endTime: raw.end_time,
    timeControl: raw.time_control,
    minutes: +base / 60,
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

/**
 * Parties les plus récentes d'un joueur, de la plus récente à la plus ancienne.
 * @param {string} user pseudo en minuscules
 * @param {{wanted:number, baseTimes:string[], onProgress?:(text:string)=>void}} options
 */
export async function fetchRecentGames(user, { wanted, baseTimes, onProgress }) {
  const index = await getJson(`${API}${encodeURIComponent(user)}/games/archives`);
  if (!Array.isArray(index.archives)) throw new Error("Chess.com a changé le format de ses données : import interrompu.");
  const games = [];
  for (const url of [...index.archives].reverse()) {
    onProgress?.(`Lecture de ${url.slice(-7)}…`);
    const month = await getJson(url);
    for (const raw of [...(month.games || [])].reverse()) {
      const game = normalise(raw, user, baseTimes);
      if (game) games.push(game);
    }
    if (games.length >= wanted) break;
  }
  return games.sort((a, b) => b.endTime - a.endTime).slice(0, wanted);
}
