import assert from "node:assert/strict";
import { test } from "node:test";
import { normalise } from "../js/data/chesscom.js";
import { createLibrary, isClosed } from "../js/data/library.js";
import { filterGames, monthLabel } from "../js/ui/panel.js";

const NOW = Date.UTC(2026, 10, 12); // 12 novembre 2026

/** Faux stockage en mémoire, avec la même interface que data/store.js. */
function memoryStore() {
  const games = new Map();
  const months = new Map();
  const archives = new Map();
  return {
    saveGames: async (list) => list.forEach((game) => games.set(game.url, game)),
    loadGames: async (user, month) => [...games.values()].filter((g) => g.user === user && g.month === month).sort((a, b) => b.endTime - a.endTime),
    saveMonth: async (record) => months.set(`${record.user}|${record.month}`, record),
    loadMonth: async (user, month) => months.get(`${user}|${month}`),
    saveArchives: async (user, list) => archives.set(user, list),
    loadArchives: async (user) => archives.get(user) ?? null,
  };
}

const game = (month, id, endTime) => ({ url: `g${id}`, user: "moi", month, endTime });

function setup({ failing = false } = {}) {
  const calls = [];
  const state = { failing };
  const api = {
    fetchArchives: async () => {
      calls.push("archives");
      if (state.failing) throw new Error("Chess.com est injoignable.");
      return ["2026/11", "2026/10"];
    },
    fetchMonth: async (user, month) => {
      calls.push(month);
      if (state.failing) throw new Error("Chess.com est injoignable.");
      return [game(month, month + "a", 1), game(month, month + "b", 2)];
    },
  };
  return { library: createLibrary({ api, store: memoryStore(), now: () => NOW }), calls, state };
}

test("un mois est définitif trois jours après sa fin", () => {
  assert.equal(isClosed("2026/10", NOW), true);
  assert.equal(isClosed("2026/11", NOW), false);
  assert.equal(isClosed("2026/10", Date.UTC(2026, 10, 2)), false);
  assert.equal(isClosed("2025/12", Date.UTC(2026, 0, 5)), true);
});

test("mois terminé : téléchargé une seule fois, puis lu en local", async () => {
  const { library, calls } = setup();
  const first = await library.games("moi", "2026/10");
  const second = await library.games("moi", "2026/10");
  assert.deepEqual(first.games.map((g) => g.url), ["g2026/10b", "g2026/10a"]);
  assert.deepEqual(second, first);
  assert.deepEqual(calls, ["2026/10"]);
});

test("mois en cours : rafraîchi à chaque consultation", async () => {
  const { library, calls } = setup();
  await library.games("moi", "2026/11");
  await library.games("moi", "2026/11");
  assert.deepEqual(calls, ["2026/11", "2026/11"]);
});

test("sans réseau : les données enregistrées restent consultables, avec un avertissement", async () => {
  const { library, state } = setup();
  await library.months("moi");
  await library.games("moi", "2026/11");
  state.failing = true;
  const months = await library.months("moi");
  assert.deepEqual(months.months, ["2026/11", "2026/10"]);
  assert.match(months.stale, /injoignable/);
  const current = await library.games("moi", "2026/11");
  assert.equal(current.games.length, 2);
  assert.match(current.stale, /injoignable/);
});

test("sans réseau et sans données : l'erreur remonte", async () => {
  const { library } = setup({ failing: true });
  await assert.rejects(library.months("moi"), /injoignable/);
  await assert.rejects(library.games("moi", "2026/10"), /injoignable/);
});

const RAW = {
  url: "https://www.chess.com/game/live/1",
  pgn: "1. e4 e5 *",
  rules: "chess",
  time_control: "600",
  end_time: 1700000000,
  eco: "https://www.chess.com/openings/Italian-Game-3...Bc5-4.c3",
  white: { username: "OnclePat", rating: 594, result: "checkmated" },
  black: { username: "Autre", rating: 610, result: "win" },
};

test("partie Chess.com : champs utiles, camp, résultat, ouverture", () => {
  const result = normalise(RAW, "onclepat", "2023/11", ["300", "600"]);
  assert.deepEqual(
    { me: result.me, result: result.result, how: result.how, minutes: result.minutes, opponent: result.opponent, opening: result.opening, month: result.month },
    { me: "w", result: "loss", how: "mat", minutes: 10, opponent: "Autre", opening: "Italian Game", month: "2023/11" },
  );
});

test("partie hors périmètre ignorée, format inattendu signalé", () => {
  assert.equal(normalise({ ...RAW, time_control: "60" }, "onclepat", "2023/11", ["300", "600"]), null);
  assert.equal(normalise({ ...RAW, rules: "chess960" }, "onclepat", "2023/11", ["300", "600"]), null);
  assert.throws(() => normalise({ ...RAW, white: {} }, "onclepat", "2023/11", ["300", "600"]), /changé le format/);
});

test("filtres de la liste et libellé du mois", () => {
  const games = [
    { result: "win", minutes: 5 },
    { result: "loss", minutes: 10 },
    { result: "loss", minutes: 5 },
  ];
  assert.equal(filterGames(games, { result: "all", minutes: "all" }).length, 3);
  assert.equal(filterGames(games, { result: "loss", minutes: "all" }).length, 2);
  assert.equal(filterGames(games, { result: "loss", minutes: "5" }).length, 1);
  assert.equal(monthLabel("2026/11"), "novembre 2026");
});
