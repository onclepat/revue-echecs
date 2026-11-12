/**
 * Étiquettes d'un coup, dans l'esprit de la revue de Chess.com :
 * Brillant, Coup unique, Meilleur, Correct, Imprécision, Erreur, Gaffe, plus la mention « Occasion manquée ».
 * Calculées à partir de l'analyse déjà faite : aucune recherche supplémentaire. Module pur.
 */
import { Chess } from "../../vendor/chess.js/chess.js";
import { DECIDED, THRESHOLDS, winOfScore } from "./eval.js";

export const LABEL_TEXT = Object.freeze({
  brillant: "Brillant",
  unique: "Coup unique",
  meilleur: "Meilleur",
  ok: "Correct",
  imprecision: "Imprécision",
  erreur: "Erreur",
  gaffe: "Gaffe",
});

/** Coup unique : le deuxième choix du moteur perd au moins autant de points. */
const UNIQUE_GAP = THRESHOLDS.gaffe;
/** Brillant : le coup est à moins de ce nombre de points du meilleur. */
const BRILLIANT_WITHIN = 2;
/** Brillant : la position ne doit pas être mauvaise après le coup. */
const BRILLIANT_MIN_AFTER = 45;
/** Un sacrifice coûte au moins la valeur d'une qualité (tour contre pièce mineure). */
const SACRIFICE_MIN = 2;

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

/**
 * Vrai si le coup offre une pièce : la pièce jouée peut être prise légalement,
 * par une pièce moins chère ou sans être défendue, et la prise coûte au moins une qualité.
 */
export function isSacrifice(fenBefore, move) {
  if (move.promotion || move.piece === "p" || move.piece === "k") return false;
  const cost = VALUE[move.piece] - (move.captured ? VALUE[move.captured] : 0);
  if (cost < SACRIFICE_MIN) return false;
  const chess = new Chess(fenBefore);
  chess.move({ from: move.from, to: move.to });
  const captures = chess.moves({ verbose: true }).filter((reply) => reply.to === move.to && reply.captured);
  if (!captures.length) return false;
  const cheapest = Math.min(...captures.map((reply) => VALUE[reply.piece]));
  return cheapest < VALUE[move.piece] || !chess.isAttacked(move.to, move.color);
}

/** Vrai si le coup reprend sur la case où l'adversaire vient de prendre (reprise évidente). */
function isRecapture(game, ply) {
  const previous = game.moves[ply - 1];
  return Boolean(previous?.captured && game.moves[ply].captured && previous.to === game.moves[ply].to);
}

/**
 * @returns {{label:string, missed:boolean, gap:number|null}}
 *   label : clé de LABEL_TEXT ; missed : occasion manquée ; gap : écart avec le deuxième choix pour un coup unique
 */
export function labelOf(game, analysis, ply) {
  const record = analysis.moves[ply];
  const move = game.moves[ply];
  if (record.cls !== "ok") {
    // Occasion manquée : l'adversaire venait de commettre une erreur, et ce coup en rend au moins autant.
    const previous = analysis.moves[ply - 1];
    const missed = Boolean(previous) && previous.loss >= THRESHOLDS.erreur && record.loss >= THRESHOLDS.erreur;
    return { label: record.cls, missed, gap: null };
  }
  const [first, second] = analysis.positions[ply].lines;
  const isBest = record.source === "meilleur";
  // Meilleure alternative au coup joué : sert à vérifier qu'on n'était pas déjà gagnant sans lui.
  const alternative = isBest ? second : first;
  if (
    alternative &&
    record.loss <= BRILLIANT_WITHIN &&
    winOfScore(alternative.score) < DECIDED.won &&
    record.winAfter >= BRILLIANT_MIN_AFTER &&
    isSacrifice(game.fens[ply], move)
  ) {
    return { label: "brillant", missed: false, gap: null };
  }
  if (isBest && second && !isRecapture(game, ply)) {
    const gap = winOfScore(first.score) - winOfScore(second.score);
    if (gap >= UNIQUE_GAP) return { label: "unique", missed: false, gap };
  }
  return { label: isBest ? "meilleur" : "ok", missed: false, gap: null };
}

/** Étiquettes de tous les coups d'une partie. */
export function labelGame(game, analysis) {
  return game.moves.map((_, ply) => labelOf(game, analysis, ply));
}
