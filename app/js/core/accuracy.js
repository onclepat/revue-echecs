/**
 * Précision d'une partie : reproduction fidèle de la formule de Lichess.
 * Sources (code public de Lichess) :
 *   lila      modules/analyse/src/main/AccuracyPercent.scala  (gameAccuracy, fromWinPercents)
 *   scalachess core/src/main/scala/eval.scala                 (WinPercent, plafond de 1000 centipions)
 *   scalalib  lila/src/main/scala/Maths.scala                 (moyennes, écart-type)
 * Module pur. Toute modification doit garder le test de conformité au vert (tests/accuracy.test.js).
 */

/** Plafond appliqué aux évaluations ; un mat vaut ce plafond. */
const CEILING = 1000;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Chances de gain (0-100) pour une évaluation en centipions, plafonnée. */
export function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -CEILING, CEILING))) - 1);
}

/** Précision d'un coup (0-100) à partir des chances de gain du joueur avant et après. */
export function moveAccuracy(before, after) {
  if (after >= before) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  return clamp(raw + 1, 0, 100);
}

/** Écart-type (variance de population). */
function standardDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/**
 * Précision des deux camps.
 * @param {number[]} whiteCps évaluation de chaque position du point de vue des Blancs, position de départ comprise ;
 *   un mat se note ±Infinity
 * @returns {{white:number|null, black:number|null}} null pour un camp qui n'a joué aucun coup
 */
export function gameAccuracy(whiteCps) {
  const wins = whiteCps.map(winPercent);
  const size = wins.length;
  const windowSize = clamp(Math.floor((size - 1) / 10), 2, 8);

  // Poids d'un coup : volatilité des chances de gain autour de lui (les moments tendus comptent plus).
  const windows = [];
  for (let k = 0; k < Math.min(windowSize, size) - 2; k++) windows.push(wins.slice(0, windowSize));
  if (size <= windowSize) windows.push(wins.slice());
  else for (let start = 0; start + windowSize <= size; start++) windows.push(wins.slice(start, start + windowSize));
  const weights = windows.map((window) => clamp(standardDeviation(window), 0.5, 12));

  const moves = { white: [], black: [] };
  for (let i = 0; i + 1 < size && i < weights.length; i++) {
    const white = i % 2 === 0;
    const accuracy = white ? moveAccuracy(wins[i], wins[i + 1]) : moveAccuracy(100 - wins[i], 100 - wins[i + 1]);
    moves[white ? "white" : "black"].push({ accuracy, weight: weights[i] });
  }

  // Moyenne de la moyenne pondérée et de la moyenne harmonique (cette dernière pénalise les grosses fautes).
  const combine = (list) => {
    if (!list.length) return null;
    const totalWeight = list.reduce((sum, m) => sum + m.weight, 0);
    const weighted = list.reduce((sum, m) => sum + m.accuracy * m.weight, 0) / totalWeight;
    const harmonic = list.length / list.reduce((sum, m) => sum + 1 / Math.max(1, m.accuracy), 0);
    return (weighted + harmonic) / 2;
  };
  return { white: combine(moves.white), black: combine(moves.black) };
}
