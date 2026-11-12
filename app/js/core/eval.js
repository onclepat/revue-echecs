/**
 * Évaluation : conversion des scores du moteur en chances de gain, classification des coups.
 * Module pur (aucun accès au navigateur) : utilisé par l'application et par les tests.
 */

/** Seuils de perte de chances de gain (en points de pourcentage). */
export const THRESHOLDS = Object.freeze({ imprecision: 5, erreur: 10, gaffe: 20 });

/** Une perte au moins égale à ce seuil est revérifiée par une seconde recherche. */
export const VERIFY_FROM = 4;

/** En dessous / au-dessus de ces chances de gain, la partie est considérée comme décidée. */
export const DECIDED = Object.freeze({ lost: 10, won: 90 });

/** Chances de gain (0-100) à partir d'un score en centipions (formule publique de Lichess). */
export function winFromCp(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Chances de gain du camp au trait pour un score UCI.
 * @param {{t:"cp"|"mate", v:number}} score score du point de vue du camp au trait
 */
export function winOfScore(score) {
  if (score.t === "mate") return score.v > 0 ? 100 : 0;
  return winFromCp(score.v);
}

/** Classe d'un coup à partir de sa perte de chances de gain. */
export function classify(loss) {
  if (loss >= THRESHOLDS.gaffe) return "gaffe";
  if (loss >= THRESHOLDS.erreur) return "erreur";
  if (loss >= THRESHOLDS.imprecision) return "imprecision";
  return "ok";
}

/** Précision d'un coup (0-100) à partir de sa perte (formule publique de Lichess). */
export function moveAccuracy(loss) {
  if (loss <= 0) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/** Précision indicative d'une série de coups : moyenne simple des précisions par coup. */
export function accuracy(losses) {
  if (!losses.length) return null;
  return losses.reduce((sum, loss) => sum + moveAccuracy(loss), 0) / losses.length;
}

/** Texte court d'un score, du point de vue des Blancs. */
export function scoreText(score, whiteToMove) {
  const sign = whiteToMove ? 1 : -1;
  if (score.t === "mate") return (sign * score.v > 0 ? "+" : "−") + "M" + Math.abs(score.v);
  const cp = sign * score.v;
  return (cp >= 0 ? "+" : "−") + Math.abs(cp / 100).toFixed(1);
}
