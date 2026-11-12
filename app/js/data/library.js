/**
 * Bibliothèque de parties : tout l'historique, chargé mois par mois à la demande.
 * - Un mois terminé ne change plus chez Chess.com : il est téléchargé une seule fois, puis lu en local.
 * - Le mois en cours est rafraîchi à chaque consultation.
 * - Sans réseau, les données déjà enregistrées restent consultables.
 * L'accès réseau et le stockage sont fournis par l'appelant, ce qui rend ce module testable.
 */

/** Délai après la fin d'un mois avant de le considérer comme définitif. */
const CLOSING_MARGIN_DAYS = 3;

/** Vrai si le mois « AAAA/MM » est terminé depuis assez longtemps pour ne plus changer. */
export function isClosed(month, nowMs) {
  const [year, number] = month.split("/").map(Number);
  return nowMs > Date.UTC(year, number, 1 + CLOSING_MARGIN_DAYS);
}

/**
 * @param {object} deps
 * @param {{fetchArchives:Function, fetchMonth:Function}} deps.api
 * @param {object} deps.store fonctions de data/store.js
 * @param {()=>number} [deps.now]
 */
export function createLibrary({ api, store, now = () => Date.now() }) {
  return {
    /**
     * Mois disponibles pour un joueur.
     * @returns {Promise<{months:string[], stale:string|null}>} stale = message si la liste vient du stockage local
     */
    async months(user) {
      try {
        const months = await api.fetchArchives(user);
        await store.saveArchives(user, months);
        return { months, stale: null };
      } catch (error) {
        const saved = await store.loadArchives(user);
        if (saved?.length) return { months: saved, stale: error.message };
        throw error;
      }
    },

    /**
     * Parties d'un mois, de la plus récente à la plus ancienne.
     * @returns {Promise<{games:object[], stale:string|null}>} stale = message si le mois n'a pas pu être rafraîchi
     */
    async games(user, month) {
      const record = await store.loadMonth(user, month);
      if (record?.complete) return { games: await store.loadGames(user, month), stale: null };
      try {
        const fetched = await api.fetchMonth(user, month);
        await store.saveGames(fetched);
        await store.saveMonth({ user, month, complete: isClosed(month, now()) });
        return { games: await store.loadGames(user, month), stale: null };
      } catch (error) {
        if (record) return { games: await store.loadGames(user, month), stale: error.message };
        throw error;
      }
    },
  };
}
