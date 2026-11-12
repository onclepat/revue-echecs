import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseGame, passFen, terminal } from "../js/core/analysis.js";
import { parseGame } from "../js/core/pgn.js";
import { keyMoments, summary } from "../js/core/review.js";
import { parseInfo, UciEngine } from "../js/core/uci.js";
import { line } from "./helpers.js";

const game = { ...parseGame("1. e4 e5 2. Nf3 Nc6 3. Bc4 *"), me: "w" };

/** Faux moteur : réponses fixées par position (ou par coup imposé). */
function fakeEngine(script) {
  const calls = [];
  const analyse = async (fen, options) => {
    calls.push({ fen, ...options });
    const key = options.searchmoves ? `${fen}|${options.searchmoves[0]}` : fen;
    return { lines: script[key] || [line(["a2a3"], 20), line(["h2h3"], 10)] };
  };
  return { analyse, calls };
}

test("coup du moteur : perte nulle ; second choix : mesuré dans la même recherche", async () => {
  const engine = fakeEngine({
    [game.fens[0]]: [line(["e2e4"], 30), line(["d2d4"], 25)],
    [game.fens[1]]: [line(["e7e5"], -30), line(["c7c5"], -32)],
    [game.fens[2]]: [line(["d2d4"], 60), line(["g1f3"], 20)],
  });
  const result = await analyseGame(game, engine.analyse, { nodes: 1000 });
  assert.equal(result.moves[0].loss, 0);
  assert.equal(result.moves[0].source, "meilleur");
  assert.equal(result.moves[2].source, "meme-recherche");
  assert.ok(result.moves[2].loss > 3 && result.moves[2].loss < 4, String(result.moves[2].loss));
});

test("erreur présumée : revérifiée, et la perte la plus faible des deux mesures est retenue", async () => {
  const engine = fakeEngine({
    [game.fens[4]]: [line(["d2d4"], 100), line(["c2c3"], 90)],
    [game.fens[5]]: [line(["f6e4"], 200), line(["d7d6"], 0)],
    [`${game.fens[4]}|f1c4`]: [line(["f1c4"], 60)],
  });
  const result = await analyseGame(game, engine.analyse, { nodes: 1000 });
  const record = result.moves[4];
  assert.equal(record.source, "verifie");
  assert.equal(record.cls, "ok");
  assert.ok(record.loss > 3 && record.loss < 4, String(record.loss));
  assert.equal(engine.calls.filter((call) => call.searchmoves?.[0] === "f1c4").length, 1);
});

test("annulation : aucune analyse lancée, résultat nul", async () => {
  const engine = fakeEngine({});
  assert.equal(await analyseGame(game, engine.analyse, { nodes: 1000, isCancelled: () => true }), null);
  assert.equal(engine.calls.length, 0);
});

test("fin de partie et position « passe »", () => {
  assert.deepEqual(terminal("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), { over: "draw" });
  assert.deepEqual(terminal("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"), { over: "mate" });
  assert.equal(terminal(game.fens[0]), null);
  assert.equal(passFen(game.fens[1]), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
  assert.equal(passFen("4k3/8/8/8/8/8/4q3/4K3 w - - 0 1"), null);
});

test("moments clés : erreurs du joueur seulement, hors partie décidée, dans l'ordre", () => {
  const record = (ply, loss, cls, decided = false) => ({ ply, loss, cls, decided });
  const analysis = {
    moves: [record(0, 25, "gaffe"), record(1, 40, "gaffe"), record(2, 12, "erreur"), record(3, 0, "ok"), record(4, 30, "gaffe", true)],
  };
  assert.deepEqual(keyMoments(game, analysis, 3).map((r) => r.ply), [0, 2]);
  const figures = summary(game, analysis);
  assert.deepEqual([figures.gaffes, figures.erreurs, figures.imprecisions], [2, 1, 0]);
});

test("protocole UCI : bornes ignorées, meilleur coup = premier coup de la première ligne", async () => {
  assert.equal(parseInfo("info depth 20 multipv 2 score cp 22 upperbound nodes 8 pv e2e4 e7e5"), null);
  assert.deepEqual(parseInfo("info depth 18 seldepth 30 multipv 1 score mate -3 nodes 8 pv e2e4 e7e5"), {
    multipv: 1,
    depth: 18,
    score: { t: "mate", v: -3 },
    pv: ["e2e4", "e7e5"],
  });

  const transport = { onLine: null, sent: [] };
  transport.send = (text) => {
    transport.sent.push(text);
    const reply = (...lines) => queueMicrotask(() => lines.forEach((l) => transport.onLine?.(l)));
    if (text === "uci") reply("id name Faux moteur", "uciok");
    else if (text === "isready") reply("readyok");
    else if (text.startsWith("go"))
      reply(
        "info depth 10 multipv 1 score cp 10 nodes 5 pv g1f3 d7d5",
        "info depth 10 multipv 2 score cp 5 nodes 5 pv d2d4 d7d5",
        "info depth 11 multipv 1 score cp 30 lowerbound nodes 9 pv b1c3",
        "bestmove b1c3 ponder d7d5",
      );
  };
  const engine = new UciEngine(transport);
  const result = await engine.analyse("position-de-test", { nodes: 1000, searchmoves: ["g1f3"] });
  assert.equal(engine.name, "Faux moteur");
  assert.equal(result.lines[0].pv[0], "g1f3");
  assert.equal(result.lines.length, 2);
  assert.ok(transport.sent.includes("go nodes 1000 searchmoves g1f3"));
});
