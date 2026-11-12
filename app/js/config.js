/**
 * Réglages de l'application. Modifier NODES ou ANALYSIS_VERSION invalide les analyses déjà stockées.
 */

/**
 * Moteurs disponibles.
 * - complet : le plus juste (réseau de neurones entier, 99 Mo), réservé aux ordinateurs.
 * - léger : 1,8 Mo, pour les téléphones, où le moteur complet ne tient pas en mémoire.
 * Les analyses sont rangées par moteur : celles de l'un ne sont jamais présentées comme celles de l'autre.
 */
const ENGINES = {
  complet: { url: "vendor/stockfish/stockfish-19-single.js", light: false },
  leger: { url: "vendor/stockfish/stockfish-19-lite-single.js", light: true },
};

/** Un appareil dont le pointeur principal est le doigt est traité comme un téléphone ou une tablette. */
const isTouchDevice = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;

/**
 * Choix forcé par l'adresse, pour essayer un moteur sur un appareil : « ?moteur=complet » ou « ?moteur=leger ».
 * Sans ce paramètre, le moteur est choisi selon l'appareil.
 */
const forced = ENGINES[new URLSearchParams(globalThis.location?.search ?? "").get("moteur")];

export const ENGINE = forced ?? (isTouchDevice ? ENGINES.leger : ENGINES.complet);

/** Budget de calcul par position : fixe, donc résultat reproductible. */
export const NODES = 400_000;

/** À incrémenter quand la méthode d'analyse change. */
export const ANALYSIS_VERSION = 1;

/** Délai maximal de démarrage du moteur (le premier téléchargement du moteur complet peut être long). */
export const ENGINE_START_TIMEOUT_MS = 180_000;

/**
 * Nombre de moteurs en parallèle : un par cœur disponible, moins un pour l'interface, quatre au plus.
 * Deux au plus pour le moteur complet sur un appareil tactile, dont la mémoire est limitée par le navigateur.
 */
const POOL_LIMIT = isTouchDevice && !ENGINE.light ? 2 : 4;
export const POOL_SIZE = Math.max(1, Math.min(POOL_LIMIT, (globalThis.navigator?.hardwareConcurrency || 2) - 1));

/** À l'ouverture, nombre de mois récents parcourus pour trouver le premier qui contient des parties. */
export const MONTHS_TO_SCAN = 6;

/** Nombre de moments clés montrés par partie. */
export const KEY_MOMENTS = 3;

/** Dans l'exercice « trouvez mieux », un coup à moins de ce nombre de points du meilleur est accepté. */
export const ACCEPT_WITHIN = 3;
