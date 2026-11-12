/**
 * Moteur réel (le fichier servi au navigateur), exécuté sous Node.
 * À relancer après toute mise à jour du moteur : reproductibilité et positions témoins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { UciEngine } from "../js/core/uci.js";
import { nodeTransport } from "./helpers.js";

const NODES = 100_000;
const WITNESSES = [
  { name: "mat en 1", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", best: "d1d8", mate: 1 },
  { name: "dame en prise", fen: "rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", best: "f3g5" },
  { name: "fourchette royale", fen: "r3k3/8/8/3N4/8/8/8/4K3 w q - 0 1", best: "d5c7" },
];

test("moteur web : positions témoins et reproductibilité", { timeout: 120_000 }, async () => {
  const engine = new UciEngine(await nodeTransport());
  await engine.ready;
  assert.match(engine.name, /^Stockfish 19/);
  for (const witness of WITNESSES) {
    const first = await engine.analyse(witness.fen, { nodes: NODES });
    const second = await engine.analyse(witness.fen, { nodes: NODES });
    assert.equal(first.lines[0].pv[0], witness.best, witness.name);
    if (witness.mate) assert.deepEqual(first.lines[0].score, { t: "mate", v: witness.mate });
    assert.deepEqual(first, second, `reproductibilité : ${witness.name}`);
  }
  engine.close();
});
