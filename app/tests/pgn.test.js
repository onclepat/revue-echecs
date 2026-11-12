import assert from "node:assert/strict";
import { test } from "node:test";
import { lineText, moveNumber, parseGame, playLine } from "../js/core/pgn.js";

const PGN = `[Event "Live Chess"]
[White "a"]
[Black "b"]

1. e4 {[%clk 0:09:58.6]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50.3]} 2... Nc6 {[%clk 0:09:54]} 1-0`;

test("lecture d'une partie Chess.com : coups, positions, pendules", () => {
  const game = parseGame(PGN);
  assert.deepEqual(game.moves.map((m) => m.san), ["e4", "e5", "Nf3", "Nc6"]);
  assert.deepEqual(game.moves.map((m) => m.uci), ["e2e4", "e7e5", "g1f3", "b8c6"]);
  assert.equal(game.fens.length, 5);
  assert.deepEqual(game.clocks, [598.6, 597, 590.3, 594]);
});

test("coup illisible : erreur explicite, jamais de partie tronquée en silence", () => {
  assert.throws(() => parseGame("1. e4 e5 2. Ke3 1-0"), /Partie illisible.*Ke3.*demi-coup 3/);
});

test("partie avec position de départ imposée", () => {
  const game = parseGame(`[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *`);
  assert.equal(game.fens[0], "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  assert.equal(game.moves.length, 2);
});

test("ligne du moteur : s'arrête au premier coup illégal", () => {
  const start = parseGame("1. e4 *").fens[1];
  assert.equal(playLine(start, ["e7e5", "g1f3", "a1a8", "b8c6"]).length, 2);
  assert.equal(lineText(start, ["e7e5", "g1f3", "b8c6"]), "1… e5 2. Nf3 Nc6");
  assert.equal(moveNumber(0), "1.");
  assert.equal(moveNumber(23), "12…");
});
