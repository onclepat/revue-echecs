/**
 * Analyse d'une partie : une recherche par position, puis une fiche par coup.
 * Module pur : le moteur est fourni sous la forme d'une fonction analyse(fen, options).
 */
import { Chess } from "../../vendor/chess.js/chess.js";
import { DECIDED, VERIFY_FROM, classify, winOfScore } from "./eval.js";

/** État d'une position terminée (mat, pat, nulle), ou null si la partie continue. */
export function terminal(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { over: "mate" };
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) return { over: "draw" };
  return null;
}

/** Chances de gain du camp au trait dans une position analysée. */
export function winToMove(position) {
  if (position.over === "mate") return 0;
  if (position.over === "draw") return 50;
  return winOfScore(position.lines[0].score);
}

/** Chances de gain des Blancs dans la position d'indice `index`. */
export function whiteWin(positions, index) {
  const win = winToMove(positions[index]);
  return index % 2 === 0 ? win : 100 - win;
}

/**
 * @param {{fens:string[], moves:object[]}} game
 * @param {(fen:string, options:object)=>Promise<{lines:object[]}>} analyse
 * @param {{nodes:number, concurrency?:number, onProgress?:(done:number,total:number)=>void, isCancelled?:()=>boolean}} options
 * @returns {Promise<{positions:object[], moves:object[]}|null>} null si l'analyse a été annulée
 */
export async function analyseGame(game, analyse, { nodes, concurrency = 4, onProgress, isCancelled = () => false }) {
  const startsWithWhite = game.fens[0].split(" ")[1] === "w";
  if (!startsWithWhite) throw new Error("Partie commençant par les Noirs : non prise en charge.");

  let done = 0;
  const total = game.fens.length;
  const positions = await mapLimit(game.fens, concurrency, isCancelled, async (fen) => {
    const result = terminal(fen) || (await analyse(fen, { nodes }));
    onProgress?.(++done, total);
    return result;
  });
  if (isCancelled()) return null;

  const moves = await mapLimit(game.moves, concurrency, isCancelled, async (move, ply) => {
      const before = positions[ply];
      const after = positions[ply + 1];
      const winBefore = winToMove(before);
      const lines = before.lines;
      let loss;
      let source;
      if (move.uci === lines[0].pv[0]) {
        loss = 0;
        source = "meilleur";
      } else if (lines[1] && move.uci === lines[1].pv[0]) {
        loss = Math.max(0, winBefore - winOfScore(lines[1].score));
        source = "meme-recherche";
      } else {
        loss = Math.max(0, winBefore - (100 - winToMove(after)));
        source = "position-suivante";
        if (loss >= VERIFY_FROM && !after.over) {
          // Seconde mesure, dans la position d'origine, limitée au coup joué.
          // On retient la perte la plus faible des deux : un coup n'est jamais accusé sur une seule mesure.
          const direct = await analyse(game.fens[ply], { nodes, searchmoves: [move.uci] });
          const lossDirect = Math.max(0, winBefore - winOfScore(direct.lines[0].score));
          if (lossDirect < loss) {
            loss = lossDirect;
            source = "verifie";
          }
        }
      }
      const winAfter = winBefore - loss;
      return {
        ply,
        loss,
        cls: classify(loss),
        source,
        winBefore,
        winAfter,
        // Partie déjà perdue avant le coup, ou toujours gagnée après : l'erreur ne change rien au résultat.
        decided: winBefore <= DECIDED.lost || winAfter >= DECIDED.won,
        best: lines[0].pv[0],
      };
  });
  if (isCancelled()) return null;
  return { positions, moves };
}

/**
 * Applique `task` à chaque élément avec au plus `limit` tâches simultanées.
 * L'annulation est vérifiée avant chaque tâche : une analyse abandonnée n'occupe plus les moteurs.
 */
async function mapLimit(items, limit, isCancelled, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !isCancelled()) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}

/**
 * Position où le camp au trait « passe » : sert à demander au moteur ce que l'adversaire menace.
 * @returns {string|null} null si le camp au trait est en échec (passer est impossible)
 */
export function passFen(fen) {
  if (new Chess(fen).inCheck()) return null;
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}
