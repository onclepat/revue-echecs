/**
 * Réglages de l'application. Modifier NODES ou ANALYSIS_VERSION invalide les analyses déjà stockées.
 */
export const ENGINE_URL = "vendor/stockfish/stockfish-19-lite-single.js";

/** Budget de calcul par position : fixe, donc résultat reproductible. */
export const NODES = 400_000;

/** À incrémenter quand la méthode d'analyse change. */
export const ANALYSIS_VERSION = 1;

/** Nombre de moteurs en parallèle : un par cœur disponible, moins un pour l'interface, quatre au plus. */
export const POOL_SIZE = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency || 2) - 1));

/** À l'ouverture, nombre de mois récents parcourus pour trouver le premier qui contient des parties. */
export const MONTHS_TO_SCAN = 6;

/** Nombre de moments clés montrés par partie. */
export const KEY_MOMENTS = 3;

/** Dans l'exercice « trouvez mieux », un coup à moins de ce nombre de points du meilleur est accepté. */
export const ACCEPT_WITHIN = 3;
