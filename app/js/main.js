/**
 * Point d'entrée : état de l'application et liaison entre données, moteur et interface.
 */
import { Chess } from "../vendor/chess.js/chess.js";
import { ACCEPT_WITHIN, ANALYSIS_VERSION, BASE_TIMES, ENGINE_URL, KEY_MOMENTS, MONTHS_TO_SCAN, NODES, POOL_SIZE } from "./config.js";
import { analyseGame, passFen, terminal, whiteWin, winToMove } from "./core/analysis.js";
import { winOfScore } from "./core/eval.js";
import { explain } from "./core/explain.js";
import { parseGame, toRecord } from "./core/pgn.js";
import { buildPrompt, keyMoments, summary } from "./core/review.js";
import { fetchArchives, fetchMonth } from "./data/chesscom.js";
import { createLibrary } from "./data/library.js";
import * as store from "./data/store.js";
import { EnginePool } from "./engine/pool.js";
import { workerTransport } from "./engine/worker-transport.js";
import { Board } from "./ui/board.js";
import { chartIndex, drawChart } from "./ui/chart.js";
import { initSound, initTheme, playMove } from "./ui/comfort.js";
import { $, el, fill } from "./ui/dom.js";
import { countGames, errorCard, exploreCard, gamesList, guessCard, monthLabel, moveCard, movesCard, progressCard, summaryCard } from "./ui/panel.js";

const { loadAnalysis, preferences, requestPersistence, saveAnalysis } = store;
const library = createLibrary({
  api: { fetchArchives, fetchMonth: (user, month) => fetchMonth(user, month, BASE_TIMES) },
  store,
});

const state = {
  user: "",
  months: [], // mois disponibles, « AAAA/MM », du plus récent au plus ancien
  month: null, // mois affiché
  games: [], // parties du mois affiché
  loadingMonth: false,
  filters: { result: "all", minutes: "all" }, // remis à zéro à chaque ouverture : jamais de liste vide par surprise
  libraryToken: 0, // identifie l'ouverture d'historique en cours, pour ignorer les réponses périmées
  monthToken: 0, // idem pour le chargement d'un mois
  game: null, // partie ouverte : métadonnées + fens, moves, clocks
  analysis: null, // { positions, moves, threats }
  progress: null, // { done, total } pendant l'analyse
  error: null, // message d'erreur de la partie ouverte
  ply: 0, // position affichée (0 = départ)
  guess: null, // exercice « trouvez mieux » : { ply, status, san, loss, exact }
  explore: null, // exploration libre : { chess, sans, last, busy, win, over }
  token: 0, // identifie l'analyse en cours pour ignorer les résultats périmés
};

const pool = new EnginePool({ size: POOL_SIZE, createTransport: () => workerTransport(ENGINE_URL) });
const board = new Board($("board"), onBoardMove);
let engineName = "";

const setStatus = (text) => ($("status").textContent = text);
const myWin = (index) => {
  const white = whiteWin(state.analysis.positions, index);
  return state.game.me === "w" ? white : 100 - white;
};

/* ---------- Bibliothèque de parties ---------- */

/** Ouvre l'historique d'un joueur : liste des mois, puis le mois le plus récent qui contient des parties. */
async function openLibrary(rawUser) {
  const user = rawUser.trim().toLowerCase();
  if (!user) return;
  const request = ++state.libraryToken;
  Object.assign(state, { user, months: [], month: null, games: [], loadingMonth: false });
  preferences.set("user", user);
  $("banner").hidden = true;
  setStatus("Recherche de vos parties…");
  try {
    const { months, stale } = await library.months(user);
    if (request !== state.libraryToken) return;
    state.months = months;
    if (stale) showBanner(stale + " Les parties déjà enregistrées restent consultables.");
    if (!months.length) {
      renderGames();
      setStatus("Aucune partie trouvée pour ce pseudo.");
      return;
    }
    // Le dernier mois joué peut ne contenir aucune partie de 5 ou 10 minutes : on remonte jusqu'à en trouver.
    for (const month of months.slice(0, MONTHS_TO_SCAN)) {
      await selectMonth(month);
      if (request !== state.libraryToken || state.games.length) break;
    }
    if (request === state.libraryToken && state.games.length && !state.game) openGame(state.games[0]);
  } catch (error) {
    if (request !== state.libraryToken) return;
    showBanner(error.message);
    setStatus("Import échoué.");
    renderGames();
  }
}

/** Affiche un mois : lu en local s'il est terminé et déjà chargé, sinon demandé à Chess.com. */
async function selectMonth(month) {
  const request = ++state.monthToken;
  Object.assign(state, { month, games: [], loadingMonth: true });
  renderGames();
  try {
    const { games, stale } = await library.games(state.user, month);
    if (request !== state.monthToken) return;
    state.games = games;
    if (stale) showBanner(stale + " Affichage des parties déjà enregistrées pour ce mois.");
    setStatus(`${monthLabel(month)} : ${countGames(games.length)} · ${engineName}`);
  } catch (error) {
    if (request !== state.monthToken) return;
    showBanner(error.message);
    setStatus("Chargement du mois échoué.");
  }
  state.loadingMonth = false;
  renderGames();
}

function setFilter(change) {
  Object.assign(state.filters, change);
  renderGames();
}

function showBanner(message) {
  $("banner").textContent = message;
  $("banner").hidden = false;
}

/* ---------- Ouverture et analyse d'une partie ---------- */

async function openGame(meta) {
  const token = ++state.token;
  Object.assign(state, { game: null, analysis: null, progress: null, error: null, ply: 0, guess: null, explore: null });
  $("games").classList.remove("open");
  try {
    state.game = { ...meta, ...parseGame(meta.pgn) };
  } catch (error) {
    state.game = { ...meta, fens: [new Chess().fen()], moves: [], clocks: [] };
    state.error = error.message;
    render();
    renderGames();
    return;
  }
  render();
  renderGames();
  await analyse(token);
}

const analysisKey = (game) => `${engineName}|n${NODES}|v${ANALYSIS_VERSION}|${game.url}`;

async function analyse(token) {
  const game = state.game;
  state.error = null;
  try {
    const stored = await loadAnalysis(analysisKey(game));
    if (token !== state.token) return;
    if (stored) {
      state.analysis = stored;
      render();
      return;
    }
    state.progress = { done: 0, total: game.fens.length };
    render();
    const started = Date.now();
    const result = await analyseGame(game, (fen, options) => pool.analyse(fen, options), {
      nodes: NODES,
      concurrency: POOL_SIZE,
      isCancelled: () => token !== state.token,
      onProgress: (done, total) => {
        if (token !== state.token) return;
        state.progress = { done, total };
        scheduleRender();
      },
    });
    if (!result || token !== state.token) return;
    result.threats = await findThreats(game, result);
    if (token !== state.token) return;
    await saveAnalysis(analysisKey(game), result);
    state.analysis = result;
    state.progress = null;
    setStatus(`Analyse terminée en ${Math.round((Date.now() - started) / 1000)} s · ${engineName}`);
    render();
  } catch (error) {
    if (token !== state.token) return;
    state.progress = null;
    state.error = error.message;
    render();
  }
}

/** Pour chaque erreur du joueur : ce que l'adversaire menaçait avant le coup (position où le joueur « passe »). */
async function findThreats(game, analysis) {
  const threats = {};
  const errors = analysis.moves.filter((record) => game.moves[record.ply].color === game.me && record.loss >= 10 && !record.decided);
  await Promise.all(
    errors.map(async (record) => {
      const fen = passFen(game.fens[record.ply]);
      if (fen && !terminal(fen)) threats[record.ply] = await pool.analyse(fen, { nodes: NODES });
    }),
  );
  return threats;
}

function explanationFor(ply) {
  const { game, analysis } = state;
  return explain({
    fenBefore: game.fens[ply],
    fenAfter: game.fens[ply + 1],
    move: game.moves[ply],
    before: analysis.positions[ply],
    after: analysis.positions[ply + 1],
    threat: analysis.threats?.[ply] ?? null,
  });
}

/* ---------- Navigation, exercice, exploration ---------- */

function go(ply, { silent = false } = {}) {
  if (!state.game) return;
  const target = Math.max(0, Math.min(state.game.fens.length - 1, ply));
  const forward = target === state.ply + 1;
  state.explore = null;
  if (state.guess && target !== state.guess.ply) state.guess = null;
  state.ply = target;
  if (forward && !silent) playMove(Boolean(state.game.moves[target - 1].captured));
  render();
}

function startGuess(ply) {
  state.explore = null;
  state.guess = { ply, status: "ask" };
  state.ply = ply;
  render();
}

async function onBoardMove(move) {
  if (state.guess && state.ply === state.guess.ply && !state.explore) return answerGuess(move);
  const next = state.game?.moves[state.ply];
  const uci = move.from + move.to + (move.promotion || "");
  if (!state.explore && next && next.uci === uci) return go(state.ply + 1);
  return exploreMove(move);
}

async function answerGuess(move) {
  const { game, analysis } = state;
  const guess = state.guess;
  const fen = game.fens[guess.ply];
  const played = toRecord(new Chess(fen).move(move));
  const before = analysis.positions[guess.ply];
  playMove(Boolean(played.captured));
  if (played.uci === before.lines[0].pv[0]) {
    Object.assign(guess, { status: "right", san: played.san, exact: true });
    return render();
  }
  Object.assign(guess, { status: "busy", san: played.san });
  render();
  try {
    const direct = await pool.analyse(fen, { nodes: NODES, searchmoves: [played.uci] });
    if (state.guess !== guess) return;
    const loss = Math.max(0, winToMove(before) - winOfScore(direct.lines[0].score));
    Object.assign(guess, loss <= ACCEPT_WITHIN ? { status: "right", exact: false } : { status: "wrong", loss });
  } catch (error) {
    state.error = error.message;
  }
  render();
}

async function exploreMove(move) {
  if (!state.game) return;
  const explore = (state.explore ??= { chess: new Chess(state.game.fens[state.ply]), sans: [], last: null, busy: false, win: null, over: null });
  if (explore.busy || explore.over) return;
  const mine = explore.chess.turn();
  const played = explore.chess.move(move);
  explore.sans.push(played.san);
  explore.last = played;
  explore.busy = true;
  playMove(Boolean(played.captured));
  render();
  const fen = explore.chess.fen();
  const end = terminal(fen);
  try {
    if (end) {
      explore.over = end.over === "mate" ? "Échec et mat." : "Partie nulle.";
    } else {
      const result = await pool.analyse(fen, { nodes: NODES });
      if (state.explore !== explore) return;
      const moverWin = 100 - winOfScore(result.lines[0].score);
      explore.win = mine === state.game.me ? moverWin : 100 - moverWin;
      const reply = result.lines[0].pv[0];
      const answer = explore.chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
      explore.sans.push(answer.san);
      explore.last = answer;
      playMove(Boolean(answer.captured));
      const after = terminal(explore.chess.fen());
      if (after) explore.over = after.over === "mate" ? "Échec et mat : le moteur gagne." : "Partie nulle.";
    }
  } catch (error) {
    state.error = error.message;
  }
  explore.busy = false;
  render();
}

async function copyPrompt(ply) {
  const text = buildPrompt({ game: state.game, analysis: state.analysis, ply, facts: explanationFor(ply).facts });
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Prompt copié : collez-le dans ChatGPT ou Gemini.");
  } catch {
    setStatus("Copie impossible : le navigateur a refusé l'accès au presse-papiers.");
  }
}

/* ---------- Affichage ---------- */

let frame = null;
function scheduleRender() {
  frame ??= requestAnimationFrame(() => {
    frame = null;
    render();
  });
}

function renderGames() {
  fill(
    $("games"),
    gamesList({
      months: state.months,
      month: state.month,
      games: state.games,
      filters: state.filters,
      loading: state.loadingMonth,
      activeUrl: state.game?.url,
      onMonth: selectMonth,
      onFilter: setFilter,
      onOpen: openGame,
    }),
  );
}

function clockAt(color) {
  const { game } = state;
  for (let index = state.ply - 1; index >= 0; index--) {
    if (game.moves[index].color === color && game.clocks[index] != null) {
      const seconds = Math.floor(game.clocks[index]);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
  }
  return "";
}

function render() {
  const { game, analysis, guess, explore } = state;
  if (!game) {
    fill($("panel"), el("div", { class: "card empty", text: "Aucune partie ouverte." }));
    return;
  }
  const flip = game.me === "b";
  const guessing = guess && state.ply === guess.ply && !explore;
  const shown = state.ply - 1;
  const record = analysis && shown >= 0 ? analysis.moves[shown] : null;
  const showArrow = record && !explore && !guess && game.moves[shown].color === game.me && record.loss >= 5;

  board.set({
    fen: explore ? explore.chess.fen() : game.fens[state.ply],
    flip,
    last: explore ? explore.last : shown >= 0 ? game.moves[shown] : null,
    arrow: showArrow ? record.best : null,
    interactive: !explore?.busy,
  });

  const them = flip ? "w" : "b";
  const player = (name, rating, color, me) => [el("b", { text: name }), el("span", { class: "muted num", text: String(rating) }), me && el("span", { class: "muted", text: "· vous" }), el("span", { class: "clock", text: clockAt(color) })];
  fill($("player-top"), player(game.opponent, game.opponentRating, them, false));
  fill($("player-bottom"), player(state.user, game.myRating, game.me, true));

  // Jauge : masquée pendant l'exercice pour ne pas donner d'indice.
  const gauge = $("gauge");
  gauge.classList.toggle("flipped", flip);
  gauge.classList.toggle("masked", Boolean(guessing) || !analysis);
  const win = explore?.win ?? (analysis ? myWin(state.ply) : 50);
  $("gauge-fill").style.height = win + "%";

  $("chart-card").hidden = !analysis;
  if (analysis) {
    const values = game.fens.map((_, index) => myWin(index));
    drawChart($("chart"), { values, current: state.ply, moments: keyMoments(game, analysis, KEY_MOMENTS) });
    $("chart-now").textContent = guessing ? "" : Math.round(values[state.ply]) + " %";
  }

  fill($("panel"), panelContent(guessing));
  const current = document.querySelector("#moves .current");
  current?.scrollIntoView({ block: "nearest" });
}

function panelContent(guessing) {
  const { game, analysis, guess, explore } = state;
  const parts = [];
  if (state.error) parts.push(errorCard(state.error, game.moves.length ? () => analyse(state.token) : null));
  if (state.progress && !analysis) parts.push(progressCard(state.progress.done, state.progress.total));

  if (explore) parts.push(exploreCard({ explore, onBack: () => go(state.ply, { silent: true }) }));
  else if (guessing) parts.push(guessCard({ game, guess, onReveal: () => { state.guess = null; go(guess.ply + 1, { silent: true }); }, onQuit: () => { state.guess = null; render(); } }));
  else {
    const index = state.ply - 1;
    const needsExplanation = analysis && index >= 0 && game.moves[index].color === game.me && analysis.moves[index].cls !== "ok";
    parts.push(
      el("section", {},
        el("h2", { class: "section-title", text: "Coup sélectionné" }),
        moveCard({ game, analysis, ply: state.ply, explanation: needsExplanation ? explanationFor(index) : null, onReplay: () => startGuess(index), onCopy: () => copyPrompt(index) }),
      ),
    );
  }

  if (analysis && !guessing) {
    const moments = keyMoments(game, analysis, KEY_MOMENTS);
    parts.push(...summaryCard({ figures: summary(game, analysis), moments, game, onMoment: (record) => startGuess(record.ply) }));
  }
  if (game.moves.length && !guessing) parts.push(movesCard({ game, analysis, ply: state.ply, onGo: go }));
  return parts;
}

/* ---------- Interactions ---------- */

$("import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.token++;
  Object.assign(state, { game: null, analysis: null, progress: null, error: null });
  render();
  openLibrary($("user").value);
});
$("toggle-games").addEventListener("click", () => $("games").classList.toggle("open"));
document.querySelector(".nav").addEventListener("click", (event) => {
  const action = event.target.closest("[data-go]")?.dataset.go;
  if (!action || !state.game) return;
  go({ start: 0, prev: state.ply - 1, next: state.ply + 1, end: state.game.fens.length - 1 }[action]);
});
$("chart").addEventListener("click", (event) => state.game && go(chartIndex($("chart"), event, state.game.fens.length), { silent: true }));
document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || !state.game) return;
  const target = { ArrowLeft: state.ply - 1, ArrowRight: state.ply + 1, ArrowUp: 0, ArrowDown: state.game.fens.length - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  go(target);
});
window.addEventListener("resize", scheduleRender);

/* ---------- Démarrage ---------- */

initTheme($("toggle-theme"));
initSound($("toggle-sound"));
renderGames();
setStatus("Démarrage du moteur…");
const startTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 30_000));
Promise.race([pool.engineName(), startTimeout]).then(
  (name) => {
    engineName = name;
    setStatus(`Moteur prêt · ${name}`);
    requestPersistence();
    const saved = preferences.get("user", "");
    if (saved) {
      $("user").value = saved;
      openLibrary(saved);
    }
  },
  () => showBanner("Le moteur d'échecs n'a pas pu démarrer dans ce navigateur."),
);
