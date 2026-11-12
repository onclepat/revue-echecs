/**
 * Lecture d'une partie Chess.com : coups, positions et pendules.
 * Module pur. Une partie illisible lève une erreur : elle n'est jamais tronquée en silence.
 */
import { Chess } from "../../vendor/chess.js/chess.js";

const CLOCK = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g;

/** Valeur d'un en-tête PGN, ou null. */
function header(pgn, name) {
  const match = pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`));
  return match ? match[1] : null;
}

/**
 * @param {string} pgn
 * @returns {{fens:string[], moves:object[], clocks:number[]}}
 *   fens[i] = position avant le coup i ; clocks[i] = secondes restantes après le coup i.
 */
export function parseGame(pgn) {
  const body = pgn.split("\n").filter((line) => !line.startsWith("[")).join(" ");
  const clocks = [...body.matchAll(CLOCK)].map((m) => +m[1] * 3600 + +m[2] * 60 + +m[3]);
  const tokens = body
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ")
    .split(/\s+/)
    .filter(Boolean);

  const start = header(pgn, "SetUp") === "1" ? header(pgn, "FEN") : null;
  const chess = start ? new Chess(start) : new Chess();
  const fens = [chess.fen()];
  const moves = [];
  for (const token of tokens) {
    let move;
    try {
      move = chess.move(token);
    } catch {
      throw new Error(`Partie illisible : coup « ${token} » refusé au demi-coup ${moves.length + 1}.`);
    }
    moves.push(toRecord(move));
    fens.push(chess.fen());
  }
  return { fens, moves, clocks };
}

/** Réduit un coup chess.js aux champs utiles (objet simple, stockable). */
export function toRecord(move) {
  return {
    color: move.color,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured || null,
    promotion: move.promotion || null,
    san: move.san,
    uci: move.from + move.to + (move.promotion || ""),
  };
}

/** Numéro affiché d'un demi-coup : « 12. » ou « 12… ». */
export function moveNumber(ply) {
  return `${Math.floor(ply / 2) + 1}${ply % 2 ? "…" : "."}`;
}

/**
 * Joue une suite de coups UCI depuis une position.
 * S'arrête au premier coup illégal (ligne du moteur tronquée).
 * @returns {object[]} coups joués, avec `check` et `mate`
 */
export function playLine(fen, ucis, max = Infinity) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of ucis.slice(0, max)) {
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    out.push({ ...toRecord(move), check: chess.inCheck(), mate: chess.isCheckmate(), after: chess.fen() });
  }
  return out;
}

/** Ligne en notation lisible : « 12. Fd3 g4 13. hxg4 ». */
export function lineText(fen, ucis, max = 8) {
  const parts = fen.split(" ");
  let number = +parts[5];
  let white = parts[1] === "w";
  return playLine(fen, ucis, max)
    .map((move, index) => {
      const prefix = white ? `${number}. ` : index === 0 ? `${number}… ` : "";
      if (!white) number++;
      white = !white;
      return prefix + move.san;
    })
    .join(" ");
}
