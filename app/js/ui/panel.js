/**
 * Panneau d'analyse et liste des parties : fonctions d'affichage, sans état propre.
 */
import { CLASS_LABEL } from "../core/eval.js";
import { lineText, moveNumber } from "../core/pgn.js";
import { el, percent } from "./dom.js";

const RESULT = { win: "Victoire", loss: "Défaite", draw: "Nulle" };

const RESULT_FILTERS = [["all", "Toutes"], ["win", "Gagnées"], ["loss", "Perdues"]];

/** Cadences présentes dans une liste de parties, de la plus rapide à la plus lente. */
export function cadencesOf(games) {
  const seconds = new Map(games.map((game) => [game.cadence, game.cadenceSeconds]));
  return [...seconds.keys()].sort((a, b) => seconds.get(a) - seconds.get(b));
}

/** « 2026/11 » → « novembre 2026 ». */
export function monthLabel(month) {
  const [year, number] = month.split("/").map(Number);
  return new Date(Date.UTC(year, number - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** « 1 partie », « 12 parties ». */
export const countGames = (count) => `${count} partie${count > 1 ? "s" : ""}`;

/** Parties retenues par les filtres de résultat et de cadence. */
export function filterGames(games, filters) {
  return games.filter(
    (game) => (filters.result === "all" || game.result === filters.result) && (filters.cadence === "all" || game.cadence === filters.cadence),
  );
}

function segmented(options, current, onPick, label) {
  return el("div", { class: "segmented", role: "group", "aria-label": label },
    options.map(([value, text]) =>
      el("button", { type: "button", class: value === current ? "on" : "", "aria-pressed": String(value === current), text, onClick: () => onPick(value) })),
  );
}

/**
 * Colonne des parties : choix du mois, filtres, liste.
 * @param {object} view { months, month, games, filters, loading, activeUrl, onMonth, onFilter, onOpen }
 */
export function gamesList({ months, month, games, filters, loading, activeUrl, onMonth, onFilter, onOpen }) {
  if (!months.length) return [el("div", { class: "card empty", text: "Entrez votre pseudo Chess.com pour retrouver toutes vos parties." })];
  const cadences = loading ? [] : cadencesOf(games);
  const select = el("select", { class: "month-select", "aria-label": "Mois", onChange: (event) => onMonth(event.target.value) },
    months.map((value) => el("option", { value, selected: value === month, text: monthLabel(value) })),
  );
  const controls = el("div", { class: "games-controls" },
    select,
    segmented(RESULT_FILTERS, filters.result, (value) => onFilter({ result: value }), "Résultat"),
    // Le filtre de cadence n'apparaît que si le mois en contient plusieurs, et ne propose que celles-là.
    cadences.length > 1 && segmented([["all", "Toutes"], ...cadences.map((name) => [name, name])], filters.cadence, (value) => onFilter({ cadence: value }), "Cadence"),
  );
  if (loading) return [controls, el("div", { class: "card empty", text: `Chargement de ${monthLabel(month)}…` })];
  const shown = filterGames(games, filters);
  const count = el("h2", { class: "section-title", text: shown.length === games.length ? countGames(games.length) : `${countGames(shown.length)} sur ${games.length}` });
  if (!shown.length) {
    const text = games.length ? "Aucune partie ne correspond à ces filtres." : "Aucune partie classique ce mois-là.";
    return [controls, count, el("div", { class: "card empty", text })];
  }
  const rows = shown.map((game) => {
    const date = new Date(game.endTime * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return el(
      "button",
      { class: "game" + (game.url === activeUrl ? " active" : ""), type: "button", onClick: () => onOpen(game) },
      el("div", { class: "game-top" },
        el("span", { class: "game-result " + game.result, text: RESULT[game.result] }),
        el("span", { class: "muted num", text: String(game.myRating) }),
        el("span", { class: "game-date num", text: date }),
      ),
      el("div", { class: "game-line" },
        el("span", { class: "side " + game.me, title: game.me === "w" ? "Vous aviez les Blancs" : "Vous aviez les Noirs" }),
        `${game.opponent} (${game.opponentRating}) · ${game.cadence} · ${game.how}`,
      ),
      game.opening && el("div", { class: "game-line", text: game.opening }),
    );
  });
  return [controls, count, el("div", { class: "card" }, rows)];
}

/** Carte affichée pendant l'analyse. */
export function progressCard(done, total) {
  return el("div", { class: "card move-card" },
    el("p", { text: `Analyse en cours : ${done} positions sur ${total}.` }),
    el("p", { class: "muted", text: "Vous pouvez déjà parcourir la partie." }),
    el("div", { class: "progress" }, el("i", { style: `width:${(100 * done) / total}%` })),
  );
}

/** Carte d'erreur, avec un bouton pour réessayer. */
export function errorCard(message, onRetry) {
  return el("div", { class: "card move-card" },
    el("p", { class: "verdict bad", text: "Analyse interrompue" }),
    el("p", { text: message }),
    onRetry && el("div", { class: "actions" }, el("button", { class: "button block", type: "button", text: "Réessayer", onClick: onRetry })),
  );
}

/** Résumé de la partie : chiffres et moments clés (sans indice : la solution n'est pas dévoilée avant l'exercice). */
export function summaryCard({ figures, moments, game, onMoment }) {
  const figure = (value, label) => el("div", { class: "figure" }, el("b", { class: "num", text: String(value) }), el("span", { text: label }));
  const head = el("div", { class: "card summary" },
    el("div", { class: "summary-figures" },
      figure(figures.gaffes, "gaffes"),
      figure(figures.erreurs, "erreurs"),
      figure(figures.imprecisions, "imprécisions"),
      figure(figures.accuracy == null ? "—" : figures.accuracy.toFixed(0), "précision (indicative)"),
    ),
  );
  const list = moments.length
    ? el("div", { class: "card" }, moments.map((record) =>
        el("button", { class: "moment", type: "button", onClick: () => onMoment(record) },
          el("span", { class: "tag " + record.cls, text: CLASS_LABEL[record.cls] }),
          el("span", { class: "moment-move num", text: `${moveNumber(record.ply)} ${game.moves[record.ply].san}` }),
          el("span", { class: "moment-loss num", text: `−${Math.round(record.loss)} %` }),
          el("span", { class: "moment-hint", text: "Rejouez ce moment : trouvez mieux que votre coup." }),
        )))
    : el("div", { class: "card empty", text: "Aucune erreur décisive dans cette partie." });
  return [
    el("section", {}, el("h2", { class: "section-title", text: "Votre partie" }), head),
    el("section", {}, el("h2", { class: "section-title", text: "Moments clés à rejouer" }), list),
  ];
}

/** Carte du coup sélectionné. */
export function moveCard({ game, analysis, ply, explanation, onReplay, onCopy }) {
  if (ply === 0) return el("div", { class: "card move-card" }, el("p", { class: "muted", text: "Position de départ. Utilisez les flèches, ou jouez un coup sur l'échiquier." }));
  const index = ply - 1;
  const move = game.moves[index];
  const title = el("span", { class: "move-san num", text: `${moveNumber(index)} ${move.san}` });
  if (!analysis) return el("div", { class: "card move-card" }, el("div", { class: "move-head" }, title), el("p", { class: "muted", text: "Analyse en cours…" }));

  const record = analysis.moves[index];
  const mine = move.color === game.me;
  const myBefore = mine ? record.winBefore : 100 - record.winBefore;
  const myAfter = mine ? record.winAfter : 100 - record.winAfter;
  const head = el("div", { class: "move-head" },
    title,
    el("span", { class: "tag " + (mine ? record.cls : "neutral"), text: mine ? CLASS_LABEL[record.cls] : "Adversaire" }),
    el("span", { class: "move-change num", text: `${percent(myBefore)} → ${percent(myAfter)}` }),
  );
  const body = [];
  if (!mine) {
    if (record.loss >= 10) body.push(el("p", { text: `Erreur de l'adversaire : vos chances passent de ${percent(myBefore)} à ${percent(myAfter)}.` }));
  } else if (record.cls === "ok") {
    body.push(el("p", { class: "verdict good", text: record.source === "meilleur" ? "C'est le premier choix du moteur." : "Coup correct." }));
  } else {
    const before = analysis.positions[index];
    const after = analysis.positions[index + 1];
    body.push(
      el("div", { class: "label", text: "Meilleur coup" }),
      el("div", { class: "best" }, el("b", { text: explanation.bestSan || "—" }), el("span", { class: "line", text: lineText(game.fens[index], before.lines[0].pv, 6) })),
      el("div", { class: "label", text: "Pourquoi" }),
      explanation.facts.length
        ? el("p", { text: explanation.facts.join(" ") })
        : el("p", { class: "muted", text: "Pas d'explication automatique fiable pour ce coup. Jouez la suite sur l'échiquier pour voir la réponse du moteur, ou copiez le prompt." }),
      !after.over && el("p", { class: "line", text: "Réponse adverse : " + lineText(game.fens[index + 1], after.lines[0].pv, 6) }),
      record.decided && el("p", { class: "muted", text: "La partie était déjà décidée à ce moment : ce coup ne change pas le résultat." }),
      el("div", { class: "actions" },
        el("button", { class: "button block", type: "button", text: "Rejouer ce moment", onClick: onReplay }),
        el("button", { class: "button block", type: "button", text: "Copier le prompt IA", onClick: onCopy }),
      ),
    );
  }
  return el("div", { class: "card move-card" }, head, body);
}

/** Carte de l'exercice « trouvez mieux ». */
export function guessCard({ game, guess, onReveal, onQuit }) {
  const move = game.moves[guess.ply];
  const verdict = {
    ask: null,
    busy: el("p", { class: "muted", text: "Vérification par le moteur…" }),
    right: el("p", { class: "verdict good", text: `${guess.san} : bien vu. ${guess.exact ? "C'est le premier choix du moteur." : "Ce coup vaut le meilleur."}` }),
    wrong: el("p", { class: "verdict bad", text: `${guess.san} perd encore ${Math.round(guess.loss)} points. Réessayez.` }),
  }[guess.status];
  return el("div", { class: "card move-card" },
    el("div", { class: "move-head" }, el("span", { class: "move-san", text: "À vous de jouer" })),
    el("p", { text: `Ici, vous avez joué ${moveNumber(guess.ply)} ${move.san}. Trouvez mieux : jouez votre coup sur l'échiquier.` }),
    verdict,
    el("div", { class: "actions" },
      el("button", { class: "button block", type: "button", text: "Voir la solution", onClick: onReveal }),
      guess.status === "right" ? null : el("button", { class: "button block", type: "button", text: "Quitter l'exercice", onClick: onQuit }),
    ),
  );
}

/** Carte du mode exploration (coups joués librement, le moteur répond). */
export function exploreCard({ explore, onBack }) {
  const status = explore.busy
    ? "Le moteur réfléchit…"
    : explore.over
      ? explore.over
      : `Vos chances de gain : ${percent(explore.win)}.`;
  return el("div", { class: "card move-card" },
    el("div", { class: "move-head" }, el("span", { class: "move-san", text: "Exploration" })),
    el("p", { class: "num", text: explore.sans.join(" ") }),
    el("p", { text: status }),
    el("p", { class: "muted", text: "Vous jouez, le moteur répond par son meilleur coup." }),
    el("div", { class: "actions" }, el("button", { class: "button block", type: "button", text: "Revenir à la partie", onClick: onBack })),
  );
}

/** Liste des coups de la partie. */
export function movesCard({ game, analysis, ply, onGo }) {
  const cells = [];
  for (let index = 0; index < game.moves.length; index += 2) {
    cells.push(el("span", { class: "n num", text: String(index / 2 + 1) }));
    for (const j of [index, index + 1]) {
      if (j >= game.moves.length) {
        cells.push(el("span"));
        continue;
      }
      const record = analysis?.moves[j];
      const marked = record && game.moves[j].color === game.me && record.cls !== "ok";
      cells.push(
        el("button", { class: ply === j + 1 ? "current" : "", type: "button", onClick: () => onGo(j + 1) },
          el("span", { class: "dot " + (marked ? record.cls : "") }),
          game.moves[j].san,
        ),
      );
    }
  }
  return el("section", {}, el("h2", { class: "section-title", text: "Coups" }), el("div", { class: "card moves", id: "moves" }, cells));
}
