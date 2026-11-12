/**
 * Explications d'un coup : uniquement des faits vérifiés par les lignes du moteur.
 * Quand rien n'est établi avec certitude, la liste est vide et l'interface le dit.
 * Module pur.
 */
import { playLine } from "./pgn.js";

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi" };
const FEMININE = new Set(["r", "q"]);

/** « le fou », « la tour ». */
export function thePiece(type) {
  return (FEMININE.has(type) ? "la " : "le ") + NAME[type];
}

/** « un fou », « deux pions », « une tour et un pion ». */
export function countPieces(types) {
  const order = ["q", "r", "b", "n", "p"];
  const words = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit"];
  const parts = [];
  for (const type of order) {
    const count = types.filter((t) => t === type).length;
    if (!count) continue;
    if (count === 1) parts.push(type === "q" ? "la dame" : (FEMININE.has(type) ? "une " : "un ") + NAME[type]);
    else parts.push(`${words[count] || count} ${NAME[type]}s`);
  }
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
}

const forcing = (move) => Boolean(move && (move.captured || move.promotion || move.check));

/**
 * Bilan des prises d'une ligne, arrêté au premier moment calme
 * (deux coups consécutifs sans prise, promotion ni échec).
 * @returns {{lost:string[], won:string[]}|null} null si la ligne se termine avant un moment calme
 *   ou contient une promotion : dans ce cas on ne conclut rien.
 */
export function exchangeBalance(line, color) {
  const lost = [];
  const won = [];
  for (let index = 0; index < line.length; index++) {
    const move = line[index];
    if (move.captured) (move.color === color ? won : lost).push(move.captured);
    if (move.promotion) return null; // une promotion ne se résume pas à un bilan de prises
    if (move.mate) return { lost, won };
    const next = line[index + 1];
    const afterNext = line[index + 2];
    if (next && afterNext && !forcing(next) && !forcing(afterNext)) return { lost, won };
  }
  return null;
}

/** Retire les pièces identiques des deux listes et renvoie le solde en points. */
export function settle({ lost, won }) {
  const value = (types) => types.reduce((sum, t) => sum + VALUE[t], 0);
  const net = value(won) - value(lost);
  const a = [...lost];
  const b = [...won];
  for (const type of [...a]) {
    const index = b.indexOf(type);
    if (index >= 0) {
      b.splice(index, 1);
      a.splice(a.indexOf(type), 1);
    }
  }
  return { net, lost: a, won: b };
}

/** « un fou contre deux pions », « un fou ». */
function trade(given, received) {
  return countPieces(given) + (received.length ? " contre " + countPieces(received) : "");
}

/**
 * @param {object} input
 * @param {string} input.fenBefore position avant le coup
 * @param {string} input.fenAfter position après le coup
 * @param {object} input.move coup joué (fiche de pgn.js)
 * @param {object} input.before analyse de la position avant le coup
 * @param {object} input.after analyse de la position après le coup
 * @param {object|null} [input.threat] analyse de la position où le joueur « passe » (menace adverse)
 * @returns {{facts:string[], bestSan:string|null, replySan:string|null}}
 */
export function explain({ fenBefore, fenAfter, move, before, after, threat = null }) {
  const me = move.color;
  const facts = [];
  const bestLine = playLine(fenBefore, before.lines[0].pv);
  const bestSan = bestLine[0]?.san ?? null;
  const replyLine = after.over ? [] : playLine(fenAfter, after.lines[0].pv);
  const reply = replyLine[0] ?? null;
  const bestScore = before.lines[0].score;
  const replyScore = after.over ? null : after.lines[0].score;

  // 1. Mats.
  if (bestScore.t === "mate" && bestScore.v > 0 && bestSan) {
    facts.push(`Vous aviez un mat en ${bestScore.v} en commençant par ${bestSan}.`);
  }
  const alreadyMated = bestScore.t === "mate" && bestScore.v < 0;
  if (replyScore && replyScore.t === "mate" && replyScore.v > 0 && !alreadyMated && reply) {
    facts.push(`Ce coup permet un mat en ${replyScore.v} : l'adversaire commence par ${reply.san}.`);
  }

  // 2. Matériel, seulement si les deux lignes atteignent un moment calme.
  let losesMaterial = false;
  if (!facts.length) {
    const played = exchangeBalance([{ ...move, check: false, mate: false }, ...replyLine], me);
    const best = exchangeBalance(bestLine, me);
    if (played && best) {
      const p = settle(played);
      const b = settle(best);
      // Garde-fou : l'écart de matériel annoncé doit être confirmé par l'écart d'évaluation du moteur.
      const swing = bestScore.t === "cp" && replyScore?.t === "cp" ? (bestScore.v + replyScore.v) / 100 : Infinity;
      if (b.net - p.net >= 1 && swing >= 0.6 * (b.net - p.net)) {
        losesMaterial = p.net < 0;
        if (p.net < 0 && reply?.captured) {
          const target =
            reply.to === move.to
              ? `${thePiece(reply.captured)} que vous venez de jouer`
              : `votre ${NAME[reply.captured]} en ${reply.to}`;
          const taken = FEMININE.has(reply.captured) ? "prise" : "pris";
          facts.push(`${cap(target)} peut être ${taken} : ${reply.san}. Au bout de la ligne, vous perdez ${trade(p.lost, p.won)}.`);
        } else if (p.net < 0) {
          facts.push(`Après ${reply.san}, vous perdez ${trade(p.lost, p.won)}.`);
        }
        if (b.net > 0 && bestSan) facts.push(`${bestSan} gagnait ${trade(b.won, b.lost)}.`);
        else if (p.net < 0 && bestSan) facts.push(`${bestSan} évitait cette perte.`);
      }
    }
  }

  // 3. Menace adverse non parée : la meilleure réponse adverse est le coup qu'il menaçait déjà.
  if (threat && reply && threat.lines[0].pv[0] === reply.uci) {
    const score = threat.lines[0].score;
    const serious = score.t === "mate" ? score.v > 0 : losesMaterial && Boolean(reply.captured);
    if (serious) facts.push(`L'adversaire menaçait déjà ${reply.san} avant votre coup : la menace n'a pas été parée.`);
  }

  return { facts, bestSan, replySan: reply?.san ?? null };
}

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
