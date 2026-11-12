/**
 * Protocole UCI : pilotage d'un moteur à travers un « transport » (navigateur ou Node).
 * Un transport expose send(texte) et une propriété onLine appelée pour chaque ligne reçue.
 */

/** Lit une ligne « info … pv … ». Renvoie null si la ligne n'est pas une évaluation exacte. */
export function parseInfo(line) {
  if (!line.startsWith("info") || !line.includes(" pv ")) return null;
  if (/ (lowerbound|upperbound)/.test(line)) return null;
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  return {
    multipv: +(line.match(/ multipv (\d+)/) || [0, 1])[1],
    depth: +(line.match(/ depth (\d+)/) || [0, 0])[1],
    score: { t: score[1], v: +score[2] },
    pv: line.split(" pv ")[1].trim().split(/\s+/),
  };
}

export class UciEngine {
  /** @param {{send:(s:string)=>void, onLine:((l:string)=>void)|null, close?:()=>void}} transport */
  constructor(transport, { multipv = 2, hash = 32 } = {}) {
    this.transport = transport;
    this.name = "";
    this.ready = this.#until("uci", (line) => {
      if (line.startsWith("id name ")) this.name = line.slice(8);
      return line === "uciok";
    }).then(() => {
      transport.send(`setoption name Hash value ${hash}`);
      transport.send(`setoption name MultiPV value ${multipv}`);
      return this.#until("isready", (line) => line === "readyok");
    });
  }

  #until(command, done) {
    return new Promise((resolve) => {
      this.transport.onLine = (line) => {
        if (done(line)) {
          this.transport.onLine = null;
          resolve(line);
        }
      };
      this.transport.send(command);
    });
  }

  /**
   * Analyse une position avec un budget de nœuds fixe (résultat reproductible).
   * Le meilleur coup est toujours le premier coup de la première ligne : coup et ligne ne peuvent pas diverger.
   * @param {string} fen
   * @param {{nodes:number, searchmoves?:string[]}} options
   * @returns {Promise<{lines:{depth:number, score:{t:string,v:number}, pv:string[]}[]}>}
   */
  async analyse(fen, { nodes, searchmoves }) {
    await this.ready;
    const lines = new Map();
    this.transport.send("ucinewgame");
    this.transport.send("position fen " + fen);
    const go = `go nodes ${nodes}` + (searchmoves ? " searchmoves " + searchmoves.join(" ") : "");
    await this.#until(go, (line) => {
      const info = parseInfo(line);
      if (info) lines.set(info.multipv, { depth: info.depth, score: info.score, pv: info.pv });
      return line.startsWith("bestmove");
    });
    const ordered = [...lines.keys()].sort((a, b) => a - b).map((key) => lines.get(key));
    if (!ordered.length) throw new Error("Le moteur n'a renvoyé aucune ligne pour " + fen);
    return { lines: ordered };
  }

  close() {
    this.transport.close?.();
  }
}
