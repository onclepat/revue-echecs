/**
 * Outils de test : moteur réel sous Node (le même fichier que dans le navigateur) et faux moteur scripté.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Transport Node pour un moteur Stockfish web fourni dans vendor/stockfish/. */
export async function nodeTransport(file) {
  let engine = require("../vendor/stockfish/" + file)();
  if (typeof engine.then === "function") engine = await engine;
  const transport = { onLine: null, send: (text) => engine.processCommand(text), close: () => engine.terminate?.() };
  engine.listener = (line) => transport.onLine?.(String(line).trim());
  return transport;
}

/** Ligne d'analyse factice. */
export const line = (pv, cp) => ({ depth: 20, score: { t: "cp", v: cp }, pv });
export const mate = (pv, n) => ({ depth: 20, score: { t: "mate", v: n }, pv });
