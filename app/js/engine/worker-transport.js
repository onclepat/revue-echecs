/**
 * Transport navigateur : un moteur Stockfish par Web Worker (fil d'exécution séparé de la page).
 */
export function workerTransport(url) {
  const worker = new Worker(url);
  const transport = {
    onLine: null,
    onError: null,
    send: (text) => worker.postMessage(text),
    close: () => worker.terminate(),
  };
  worker.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    for (const line of event.data.split("\n")) transport.onLine?.(line.trim());
  };
  worker.onerror = (event) => transport.onError?.(event);
  return transport;
}
