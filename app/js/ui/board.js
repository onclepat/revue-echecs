/**
 * Échiquier : affichage d'une position, flèche, et saisie d'un coup par deux touches (pièce, puis case).
 */
import { Chess } from "../../vendor/chess.js/chess.js";
import { el } from "./dom.js";

const FILES = "abcdefgh";
const PIECES = "vendor/pieces/cburnett/";
const SVG = "http://www.w3.org/2000/svg";

export class Board {
  /** @param {HTMLElement} root @param {(move:{from:string,to:string,promotion?:string})=>void} onMove */
  constructor(root, onMove) {
    this.root = root;
    this.onMove = onMove;
    this.state = { fen: new Chess().fen(), flip: false, last: null, arrow: null, interactive: false };
    this.selected = null;
    root.addEventListener("click", (event) => this.#click(event));
    this.render();
  }

  /** Met à jour la position affichée. */
  set(state) {
    Object.assign(this.state, state);
    this.selected = null;
    this.render();
  }

  #squareName(row, column) {
    const { flip } = this.state;
    return FILES[flip ? 7 - column : column] + (flip ? row + 1 : 8 - row);
  }

  #center(square) {
    const file = FILES.indexOf(square[0]);
    const rank = +square[1] - 1;
    return this.state.flip ? [7 - file + 0.5, rank + 0.5] : [file + 0.5, 7 - rank + 0.5];
  }

  render() {
    const { fen, last, arrow } = this.state;
    const chess = new Chess(fen);
    const targets = this.selected ? chess.moves({ square: this.selected, verbose: true }).map((m) => m.to) : [];
    const nodes = [];
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const name = this.#squareName(row, column);
        const piece = chess.get(name);
        const dark = (FILES.indexOf(name[0]) + +name[1]) % 2 === 1;
        const classes = ["square", dark && "dark"];
        if (last && (last.from === name || last.to === name)) classes.push("last");
        if (this.selected === name) classes.push("selected");
        if (targets.includes(name)) classes.push("target", piece && "occupied");
        nodes.push(
          el(
            "button",
            { class: classes.filter(Boolean).join(" "), type: "button", dataset: { square: name }, "aria-label": name, tabindex: "-1" },
            piece && el("img", { src: `${PIECES}${piece.color}${piece.type.toUpperCase()}.svg`, alt: "", draggable: "false" }),
            column === 0 && el("span", { class: "coord rank", text: name[1] }),
            row === 7 && el("span", { class: "coord file", text: name[0] }),
          ),
        );
      }
    }
    this.root.replaceChildren(...nodes, this.#arrow(arrow));
  }

  #arrow(uci) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "arrows");
    svg.setAttribute("viewBox", "0 0 8 8");
    if (!uci) return svg;
    const [x1, y1] = this.#center(uci.slice(0, 2));
    const [x2, y2] = this.#center(uci.slice(2, 4));
    const length = Math.hypot(x2 - x1, y2 - y1);
    const scale = (length - 0.4) / length;
    svg.innerHTML =
      `<defs><marker id="head" markerWidth="3" markerHeight="3" refX="1.4" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 z" fill="var(--ok)"/></marker></defs>` +
      `<line x1="${x1}" y1="${y1}" x2="${x1 + (x2 - x1) * scale}" y2="${y1 + (y2 - y1) * scale}" stroke="var(--ok)" stroke-width=".17" stroke-linecap="round" opacity=".9" marker-end="url(#head)"/>`;
    return svg;
  }

  #click(event) {
    if (!this.state.interactive) return;
    const square = event.target.closest("[data-square]")?.dataset.square;
    if (!square) return;
    const chess = new Chess(this.state.fen);
    if (this.selected) {
      const move = chess.moves({ square: this.selected, verbose: true }).find((m) => m.to === square);
      if (move) {
        // Promotion : toujours en dame (choix assumé pour la première version).
        this.onMove({ from: move.from, to: move.to, promotion: move.promotion ? "q" : undefined });
        return;
      }
    }
    const piece = chess.get(square);
    this.selected = piece && piece.color === chess.turn() && square !== this.selected ? square : null;
    this.render();
  }
}
