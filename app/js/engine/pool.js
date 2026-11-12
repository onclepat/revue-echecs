/**
 * Groupe de moteurs : répartit les analyses, remplace un moteur planté ou bloqué, retente une fois.
 * Indépendant du navigateur : la fabrique de transport est fournie par l'appelant.
 */
import { UciEngine } from "../core/uci.js";

export class EnginePool {
  /**
   * @param {object} options
   * @param {number} options.size nombre de moteurs
   * @param {()=>object} options.createTransport fabrique de transport (voir core/uci.js)
   * @param {number} [options.timeoutMs] durée maximale d'une analyse
   */
  constructor({ size, createTransport, timeoutMs = 90_000 }) {
    this.size = size;
    this.createTransport = createTransport;
    this.timeoutMs = timeoutMs;
    this.created = 0;
    this.idle = [];
    this.waiting = [];
  }

  #spawn() {
    return new UciEngine(this.createTransport());
  }

  /** Nom du moteur, tel qu'il se déclare lui-même. */
  async engineName() {
    const engine = await this.#acquire();
    try {
      await engine.ready;
      return engine.name;
    } finally {
      this.#release(engine);
    }
  }

  /**
   * Les moteurs sont créés à la demande : le premier télécharge le fichier du moteur,
   * les suivants le retrouvent dans le cache du navigateur.
   */
  #acquire() {
    if (this.idle.length) return Promise.resolve(this.idle.pop());
    if (this.created < this.size) {
      this.created++;
      return Promise.resolve(this.#spawn());
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  #release(engine) {
    const next = this.waiting.shift();
    if (next) next(engine);
    else this.idle.push(engine);
  }

  /** Analyse une position. Lève une erreur si deux tentatives échouent. */
  async analyse(fen, options) {
    let engine = await this.#acquire();
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          return await this.#guarded(engine, fen, options);
        } catch (error) {
          engine.close();
          engine = this.#spawn();
          if (attempt === 2) throw new Error(`Analyse impossible (${error.message}).`);
        }
      }
    } finally {
      this.#release(engine);
    }
  }

  #guarded(engine, fen, options) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("moteur sans réponse")), this.timeoutMs);
      engine.transport.onError = () => reject(new Error("moteur arrêté"));
      engine.analyse(fen, options).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  close() {
    this.idle.forEach((engine) => engine.close());
    this.idle = [];
  }
}
