/**
 * Précision : conformité à Lichess.
 * Le fichier fixtures/lichess-accuracy.json contient cinq vraies parties Lichess :
 * les évaluations publiées par Lichess (point de vue des Blancs) et le score de précision officiel de chaque camp.
 * Avec les mêmes évaluations en entrée, la formule doit redonner exactement le même score.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gameAccuracy, moveAccuracy, winPercent } from "../js/core/accuracy.js";
import { whiteCps } from "../js/core/review.js";
import { line, mate } from "./helpers.js";

const games = JSON.parse(readFileSync(new URL("./fixtures/lichess-accuracy.json", import.meta.url), "utf8"));
const toCp = (value) => (value === "+M" ? Infinity : value === "-M" ? -Infinity : value);
/** Évaluation que Lichess attribue à la position de départ quand elle n'est pas analysée. */
const LICHESS_INITIAL_CP = 15;

test("conformité : mêmes évaluations, même score que Lichess, sur cinq parties réelles", () => {
  for (const game of games) {
    const result = gameAccuracy([LICHESS_INITIAL_CP, ...game.cps.map(toCp)]);
    assert.equal(Math.round(result.white), game.white, `Blancs, partie ${game.id}`);
    assert.equal(Math.round(result.black), game.black, `Noirs, partie ${game.id}`);
  }
});

test("briques de la formule : chances de gain plafonnées, précision d'un coup bornée", () => {
  assert.equal(winPercent(0), 50);
  assert.equal(winPercent(Infinity), winPercent(1000));
  assert.equal(winPercent(-5000), winPercent(-1000));
  assert.equal(moveAccuracy(50, 60), 100);
  assert.equal(moveAccuracy(100, 0), 0);
  assert.ok(moveAccuracy(60, 50) > moveAccuracy(60, 30));
});

test("partie sans faute : 100 ; camp sans coup : pas de score", () => {
  assert.deepEqual(gameAccuracy([15, 15, 15, 15, 15]), { white: 100, black: 100 });
  assert.deepEqual(gameAccuracy([15, 20]), { white: 100, black: null });
});

test("positions de l'outil converties au point de vue des Blancs", () => {
  const positions = [
    { lines: [line(["e2e4"], 30)] }, // Blancs au trait, +0,30 pour eux
    { lines: [line(["e7e5"], 40)] }, // Noirs au trait, +0,40 pour eux
    { lines: [mate(["d1h5"], 2)] }, // Blancs au trait, mat en 2 pour eux
    { lines: [mate(["a7a6"], -1)] }, // Noirs au trait, ils se font mater
    { over: "mate" }, // Blancs au trait et matés
    { over: "draw" },
  ];
  assert.deepEqual(whiteCps(positions), [30, -40, Infinity, Infinity, -Infinity, 0]);
});
