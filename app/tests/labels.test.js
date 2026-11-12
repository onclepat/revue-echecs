import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "../vendor/chess.js/chess.js";
import { isSacrifice, labelGame, labelOf } from "../js/core/labels.js";
import { toRecord } from "../js/core/pgn.js";
import { summary } from "../js/core/review.js";
import { line } from "./helpers.js";

const FRIED_LIVER = "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6";

/** Coup (fiche de pgn.js) joué depuis une position. */
function moveFrom(fen, uci) {
  return toRecord(new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4) }));
}

/** Partie d'un seul coup, avec les lignes du moteur et la fiche d'analyse fournies. */
function single(fen, uci, lines, record) {
  const game = { me: "w", fens: [fen], moves: [moveFrom(fen, uci)] };
  const analysis = { positions: [{ lines }], moves: [{ ply: 0, loss: 0, cls: "ok", source: "meilleur", winAfter: 60, ...record }] };
  return [game, analysis];
}

test("sacrifice : pièce offerte pour au moins une qualité, prise légale possible", () => {
  assert.equal(isSacrifice(FRIED_LIVER, moveFrom(FRIED_LIVER, "g5f7")), true);
  const start = new Chess().fen();
  assert.equal(isSacrifice(start, moveFrom(start, "g1f3")), false, "coup de développement sans danger");
  assert.equal(isSacrifice(start, moveFrom(start, "e2e4")), false, "un pion n'est pas un sacrifice de pièce");
  const trade = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  assert.equal(isSacrifice(trade, moveFrom(trade, "f3e5")), true, "cavalier contre pion, repris par le cavalier");
  const equal = "r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";
  assert.equal(isSacrifice(equal, moveFrom(equal, "c4f7")), true, "fou contre pion, repris par le roi");
  const swap = "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3";
  assert.equal(isSacrifice(swap, moveFrom(swap, "c3d5")), false, "case défendue, attaquée par une pièce de même valeur");
});

test("brillant : sacrifice, meilleur coup ou presque, ni déjà gagnant ni mal ensuite", () => {
  const lines = [line(["g5f7", "e8f7"], 120), line(["d2d4"], 60)];
  assert.equal(labelOf(...single(FRIED_LIVER, "g5f7", lines, {}), 0).label, "brillant");
  assert.equal(labelOf(...single(FRIED_LIVER, "g5f7", lines, { winAfter: 30 }), 0).label, "meilleur", "position mauvaise après le coup");
  const winning = [line(["g5f7"], 900), line(["d2d4"], 800)];
  assert.equal(labelOf(...single(FRIED_LIVER, "g5f7", winning, {}), 0).label, "meilleur", "déjà gagnant sans le sacrifice");
  const [game, analysis] = single(FRIED_LIVER, "g5f7", [line(["d2d4"], 60), line(["g5f7"], 50)], { source: "meme-recherche", loss: 6, cls: "imprecision" });
  assert.equal(labelOf(game, analysis, 0).label, "imprecision", "un sacrifice qui perd des points n'est pas brillant");
});

test("coup unique : le deuxième choix perd au moins 20 points, hors reprise évidente", () => {
  const start = new Chess().fen();
  const unique = labelOf(...single(start, "g1f3", [line(["g1f3"], 50), line(["d2d4"], -300)], {}), 0);
  assert.equal(unique.label, "unique");
  assert.ok(unique.gap > 20);
  assert.equal(labelOf(...single(start, "g1f3", [line(["g1f3"], 50), line(["d2d4"], 20)], {}), 0).label, "meilleur");
  assert.equal(labelOf(...single(start, "g1f3", [line(["d2d4"], 50), line(["g1f3"], 45)], { source: "meme-recherche", loss: 1 }), 0).label, "ok");

  // Reprise : les Noirs prennent en d5, les Blancs reprennent sur la même case.
  const chess = new Chess("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
  const first = toRecord(chess.move("exd5"));
  const fenAfter = chess.fen();
  const second = toRecord(chess.move("Qxd5"));
  const game = { me: "b", fens: ["", fenAfter], moves: [first, second] };
  const analysis = {
    positions: [{ lines: [] }, { lines: [line(["d8d5"], 0), line(["g8f6"], -300)] }],
    moves: [{ ply: 0, loss: 0, cls: "ok", source: "meilleur", winAfter: 50 }, { ply: 1, loss: 0, cls: "ok", source: "meilleur", winAfter: 50 }],
  };
  assert.equal(labelOf(game, analysis, 1).label, "meilleur");
});

test("occasion manquée : l'adversaire s'était trompé, et le joueur rend au moins autant", () => {
  const chess = new Chess();
  const moves = ["e4", "e5", "Nf3"].map((san) => toRecord(chess.move(san)));
  const game = { me: "b", fens: [], moves };
  const analysis = {
    positions: [{ lines: [] }, { lines: [] }, { lines: [] }],
    moves: [
      { ply: 0, loss: 25, cls: "gaffe" },
      { ply: 1, loss: 30, cls: "gaffe" },
      { ply: 2, loss: 12, cls: "erreur" },
    ],
  };
  const labels = labelGame(game, analysis);
  assert.deepEqual(labels.map((l) => [l.label, l.missed]), [["gaffe", false], ["gaffe", true], ["erreur", true]]);
  const figures = summary(game, analysis, labels);
  assert.deepEqual([figures.gaffes, figures.manquees, figures.brillants], [1, 1, 0]);
});
