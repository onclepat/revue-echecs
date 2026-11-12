import assert from "node:assert/strict";
import { test } from "node:test";
import { accuracy, classify, moveAccuracy, scoreText, winFromCp, winOfScore } from "../js/core/eval.js";

test("chances de gain : symétriques autour de 50 %, saturées aux extrêmes", () => {
  assert.equal(winFromCp(0), 50);
  assert.ok(Math.abs(winFromCp(300) + winFromCp(-300) - 100) < 1e-9);
  assert.ok(winFromCp(1500) > 99 && winFromCp(-1500) < 1);
  assert.equal(winOfScore({ t: "mate", v: 3 }), 100);
  assert.equal(winOfScore({ t: "mate", v: -3 }), 0);
});

test("position déjà gagnée : passer de +15 à +8 n'est pas une erreur", () => {
  assert.equal(classify(winFromCp(1500) - winFromCp(800)), "ok");
});

test("classes : seuils à 5, 10 et 20 points", () => {
  assert.deepEqual([0, 4.9, 5, 9.9, 10, 19.9, 20, 60].map(classify), ["ok", "ok", "imprecision", "imprecision", "erreur", "erreur", "gaffe", "gaffe"]);
});

test("précision : 100 sans perte, décroissante, bornée", () => {
  assert.equal(moveAccuracy(0), 100);
  assert.ok(moveAccuracy(10) > moveAccuracy(30));
  assert.equal(moveAccuracy(100), 0);
  assert.equal(accuracy([]), null);
  assert.equal(accuracy([0, 0]), 100);
});

test("score affiché du point de vue des Blancs", () => {
  assert.equal(scoreText({ t: "cp", v: 120 }, true), "+1.2");
  assert.equal(scoreText({ t: "cp", v: 120 }, false), "−1.2");
  assert.equal(scoreText({ t: "mate", v: 2 }, false), "−M2");
});
