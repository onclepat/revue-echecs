/**
 * Moteurs réels (les fichiers servis au navigateur), exécutés sous Node.
 * À relancer après toute mise à jour d'un moteur : reproductibilité et positions témoins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { UciEngine } from "../js/core/uci.js";
import { nodeTransport } from "./helpers.js";

const NODES = 100_000;
const ENGINES = [
  { file: "stockfish-19-single.js", name: "Stockfish 19 WASM" },
  { file: "stockfish-19-lite-single.js", name: "Stockfish 19 Lite WASM" },
];
const WITNESSES = [
  { name: "mat en 1", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", best: "d1d8", mate: 1 },
  { name: "dame en prise", fen: "rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", best: "f3g5" },
  { name: "fourchette royale", fen: "r3k3/8/8/3N4/8/8/PPP5/2K5 w q - 0 1", best: "d5c7" },
];

for (const { file, name } of ENGINES) {
  test(`${name} : positions témoins et reproductibilité`, { timeout: 180_000 }, async () => {
    const engine = new UciEngine(await nodeTransport(file));
    await engine.ready;
    assert.equal(engine.name, name);
    for (const witness of WITNESSES) {
      const first = await engine.analyse(witness.fen, { nodes: NODES });
      const second = await engine.analyse(witness.fen, { nodes: NODES });
      assert.equal(first.lines[0].pv[0], witness.best, witness.name);
      if (witness.mate) assert.deepEqual(first.lines[0].score, { t: "mate", v: witness.mate });
      assert.deepEqual(first, second, `reproductibilité : ${witness.name}`);
    }
    engine.close();
  });
}
