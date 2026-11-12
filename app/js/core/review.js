/**
 * Synthèse d'une partie analysée : moments clés, compteurs, précision indicative, prompt pour une IA.
 * Module pur.
 */
import { CLASS_LABEL, accuracy } from "./eval.js";
import { lineText, moveNumber } from "./pgn.js";

/** Coups du joueur, dans l'ordre de la partie. */
export function myMoves(game, analysis) {
  return analysis.moves.filter((record) => game.moves[record.ply].color === game.me);
}

/**
 * Moments clés : les erreurs et gaffes du joueur qui ont coûté le plus,
 * hors positions déjà décidées, dans l'ordre de la partie.
 */
export function keyMoments(game, analysis, count) {
  return myMoves(game, analysis)
    .filter((record) => (record.cls === "erreur" || record.cls === "gaffe") && !record.decided)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, count)
    .sort((a, b) => a.ply - b.ply);
}

/** Compteurs et précision indicative du joueur. */
export function summary(game, analysis) {
  const mine = myMoves(game, analysis);
  const count = (cls) => mine.filter((record) => record.cls === cls).length;
  return {
    accuracy: accuracy(mine.map((record) => record.loss)),
    imprecisions: count("imprecision"),
    erreurs: count("erreur"),
    gaffes: count("gaffe"),
  };
}

/** Prompt à coller dans une IA : uniquement des données du moteur et des faits vérifiés. */
export function buildPrompt({ game, analysis, ply, facts }) {
  const move = game.moves[ply];
  const record = analysis.moves[ply];
  const before = analysis.positions[ply];
  const after = analysis.positions[ply + 1];
  const score = (s) => (s.t === "mate" ? `mat en ${Math.abs(s.v)}${s.v < 0 ? " contre lui" : ""}` : (s.v / 100).toFixed(2));
  const played = game.moves.slice(0, ply).map((m) => m.uci);
  const second = before.lines[1]
    ? `\nDeuxième option du moteur : ${lineText(game.fens[ply], before.lines[1].pv, 8)} (évaluation ${score(before.lines[1].score)} pour le camp au trait)`
    : "";
  const reply = after.over ? "(partie terminée)" : lineText(game.fens[ply + 1], after.lines[0].pv, 10);
  return `Tu es un entraîneur d'échecs. Explique-moi un coup de ma partie, en français.

Contexte : je jouais les ${game.me === "w" ? "Blancs" : "Noirs"}, je suis classé ${game.myRating} Elo (adversaire ${game.opponentRating}), cadence ${game.minutes} minutes. Adapte ton explication à ce niveau : phrases simples, idées concrètes.

Règle importante : appuie-toi uniquement sur les données du moteur ci-dessous. N'invente aucune variante. Si tu proposes un coup, vérifie qu'il est légal dans la position FEN donnée. Si tu n'es pas sûr, dis-le.

Ouverture : ${game.opening || "inconnue"}
Coups joués avant : ${lineText(game.fens[0], played, 999) || "(début de partie)"}
Position avant mon coup (FEN) : ${game.fens[ply]}

Mon coup : ${moveNumber(ply)} ${move.san}, classé « ${CLASS_LABEL[record.cls]} » par Stockfish.
Mes chances de gain : ${Math.round(record.winBefore)} % avant, ${Math.round(record.winAfter)} % après.
Meilleur coup selon le moteur : ${lineText(game.fens[ply], before.lines[0].pv, 10)} (évaluation ${score(before.lines[0].score)} pour le camp au trait)${second}
Après mon coup, meilleure suite de l'adversaire : ${reply}
Faits vérifiés par l'outil : ${facts.length ? facts.join(" ") : "aucun."}

Explique-moi :
1. L'idée de mon coup et ce qu'il fait concrètement.
2. Ce qui ne va pas dans ce coup, avec la raison concrète.
3. Pourquoi le meilleur coup est supérieur, et le plan derrière.
4. Le réflexe à retenir pour mes prochaines parties (1 ou 2 phrases).`;
}
