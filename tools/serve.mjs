/**
 * Serveur local de développement : sert le dossier app/ tel quel sur http://localhost:8770.
 * Aucune dépendance. En production, les mêmes fichiers sont servis par un hébergeur statique.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), "..", "app"));
const PORT = Number(process.env.PORT) || 8770;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
  if (!file.startsWith(ROOT + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Introuvable");
    return;
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(file).pipe(response);
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Le port ${PORT} est déjà utilisé : l'outil tourne peut-être déjà.` : error.message);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => console.log(`Revue : http://localhost:${PORT}`));
