/**
 * Explications : cas réels relevés pendant l'audit de la V2.
 * Chaque test fige une phrase juste à produire, ou une phrase fausse à ne plus jamais produire.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "../vendor/chess.js/chess.js";
import { countPieces, exchangeBalance, explain, settle } from "../js/core/explain.js";
import { playLine, toRecord } from "../js/core/pgn.js";
import { line, mate } from "./helpers.js";

/** Construit l'entrée d'explain() à partir d'une position, du coup joué et des lignes du moteur. */
function scenario(fenBefore, uci, bestLine, replyLine, threat = null) {
  const chess = new Chess(fenBefore);
  const move = toRecord(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
  return { fenBefore, fenAfter: chess.fen(), move, before: { lines: [bestLine] }, after: { lines: [replyLine] }, threat };
}

const HANGING_BISHOP = [
  "k2r4/1pR5/6pp/8/3bqP2/1P2B3/P4Q1N/6K1 w - - 1 34",
  "c7c4",
  line(["e3d4", "g6g5", "f4f5", "h6h5", "f5f6", "h5h4"], 870),
  line(["e4e3", "c4a4", "a8b8", "f2e3", "d4e3", "g1g2", "g6g5", "f4g5", "e3g5"], 0),
];

test("pièce laissée en prise : phrase exacte (34. Tc4, audit)", () => {
  const result = explain(scenario(...HANGING_BISHOP));
  assert.equal(result.bestSan, "Bxd4");
  assert.equal(result.facts[0], "Votre fou en e3 peut être pris : Qxe3. Au bout de la ligne, vous perdez un fou.");
  assert.equal(result.facts[1], "Bxd4 gagnait un fou.");
});

test("ligne coupée au milieu d'un échange : aucune affirmation de perte (12. Fd3, audit)", () => {
  const result = explain(
    scenario(
      "r2qk2r/pbpp1pp1/1pn1p3/4Pnp1/3P4/P1N2N1P/1PP1BPP1/R2Q1RK1 w kq - 0 12",
      "e2d3",
      line(["d4d5", "e6d5", "c3d5", "d7d6", "e2b5", "e8f8"], 97),
      line(["g5g4", "h3g4", "f5d4", "f3d4", "d8h4", "f2f3", "c6d4", "d3e4", "b7e4", "d1d4"], 240),
    ),
  );
  assert.ok(!result.facts.some((fact) => /perdez/.test(fact)), result.facts.join(" | "));
});

test("pièce contre deux pions : la pièce est nommée, pas « un pion » (23… dxe5, audit)", () => {
  const result = explain(
    scenario(
      "3r2k1/5ppp/3p1b2/4P3/1pp1P3/1q1P2Q1/1P4PP/2B2RK1 b - - 0 23",
      "d6e5",
      line(["f6e5", "g3f2", "c4d3", "f2b6", "d8c8", "b6b7"], 582),
      line(["f1f6", "d8d3", "g3g4", "b3d1", "g4d1", "d3d1", "f6f1", "d1d3", "g1f2", "h7h6"], 181),
    ),
  );
  assert.match(result.facts[0], /vous perdez un fou contre deux pions/);
});

test("pièce jouée sur une case attaquée : accord au féminin (11… Te8, partie réelle)", () => {
  const result = explain(
    scenario(
      "r2q1rk1/ppp1nppp/5b2/1B1Ppb2/2P5/3P1Q2/PP1N1PPP/R3K1NR b KQ - 0 11",
      "f8e8",
      line(["c7c6", "b5a4", "a7a6", "h2h3"], 60),
      line(["b5e8", "d8e8", "g1e2", "e8d7", "e1g1", "a8d8"], 330),
    ),
  );
  assert.equal(result.facts[0], "La tour que vous venez de jouer peut être prise : Bxe8. Au bout de la ligne, vous perdez une tour contre un fou.");
  assert.equal(result.facts[1], "c6 évitait cette perte.");
});

test("mat manqué et mat autorisé", () => {
  const missed = explain(
    scenario("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "g1f1", mate(["d1d8"], 1), line(["g7g6", "d1d8", "g8g7"], -50)),
  );
  assert.equal(missed.facts[0], "Vous aviez un mat en 1 en commençant par Rd8#.");

  const allowed = explain(
    scenario("6k1/5ppp/8/8/8/8/r4PPP/5RK1 w - - 0 1", "f1b1", line(["g2g3", "g7g6"], 0), mate(["a2a1", "b1a1"], 2)),
  );
  assert.match(allowed.facts[0], /^Ce coup permet un mat en 2 : l'adversaire commence par Ra1\./);
});

test("aucun fait établi : liste vide (l'interface dira qu'elle ne sait pas)", () => {
  const result = explain(
    scenario(
      "rn1qkbnr/pbpp1pp1/1p2p2p/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 5",
      "f1e2",
      line(["f1d3", "f8b4", "e1g1", "b4c3", "b2c3", "g8e7"], 127),
      line(["f8b4", "e2d3", "g8f6", "f3d2", "e8g8", "e1g1"], -48),
    ),
  );
  assert.deepEqual(result.facts, []);
});

test("menace non parée : signalée seulement si la perte de matériel est confirmée", () => {
  const input = scenario(...HANGING_BISHOP, { lines: [line(["e4e3"], 300)] });
  assert.match(explain(input).facts.at(-1), /L'adversaire menaçait déjà Qxe3 avant votre coup/);
  input.threat = { lines: [line(["d4e3"], 300)] };
  assert.ok(!explain(input).facts.some((fact) => /menaçait/.test(fact)));
});

test("bilan d'échange : inconnu sans moment calme, inconnu avec promotion", () => {
  const exchange = playLine("r2qk2r/pbpp1pp1/1pn1p3/4Pnp1/3P4/P1NB1N1P/1PP2PP1/R2Q1RK1 b kq - 1 12", ["g5g4", "h3g4", "f5d4"]);
  assert.equal(exchangeBalance(exchange, "w"), null);
  const promotion = playLine("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", ["e7e8q", "g7f6", "e1e2", "f6f5"]);
  assert.equal(exchangeBalance(promotion, "w"), null);
});

test("vocabulaire : pièces identiques compensées, accords corrects", () => {
  assert.deepEqual(settle({ lost: ["b", "q"], won: ["q"] }), { net: -3, lost: ["b"], won: [] });
  assert.equal(countPieces(["p", "p"]), "deux pions");
  assert.equal(countPieces(["r", "p"]), "une tour et un pion");
  assert.equal(countPieces(["q"]), "la dame");
});
