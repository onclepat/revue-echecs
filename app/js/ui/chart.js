/**
 * Courbe des chances de gain du joueur au fil de la partie, avec ses moments clés.
 */
const HEIGHT = 110;

/**
 * @param {SVGElement} svg
 * @param {{values:number[], current:number, moments:{ply:number, cls:string}[]}} data
 *   values[i] = chances de gain du joueur dans la position i
 */
export function drawChart(svg, { values, current, moments }) {
  const width = svg.clientWidth || 560;
  const last = Math.max(1, values.length - 1);
  const x = (index) => (index / last) * width;
  const y = (value) => HEIGHT - (value / 100) * HEIGHT;
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
  svg.innerHTML =
    `<rect width="${width}" height="${HEIGHT}" fill="var(--bg)"/>` +
    `<polygon points="0,${HEIGHT} ${points} ${width},${HEIGHT}" fill="var(--accent-soft)"/>` +
    `<polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>` +
    `<line x1="0" x2="${width}" y1="${HEIGHT / 2}" y2="${HEIGHT / 2}" stroke="var(--faint)" stroke-dasharray="4 4"/>` +
    `<line x1="${x(current)}" x2="${x(current)}" y1="0" y2="${HEIGHT}" stroke="var(--text)" stroke-width="1.5"/>` +
    moments
      .map((m) => `<circle cx="${x(m.ply + 1)}" cy="${y(values[m.ply + 1])}" r="5" fill="var(--${m.cls})" stroke="var(--surface)" stroke-width="1.5"/>`)
      .join("");
}

/** Indice de position correspondant à un clic sur la courbe. */
export function chartIndex(svg, event, count) {
  const box = svg.getBoundingClientRect();
  return Math.max(0, Math.min(count - 1, Math.round(((event.clientX - box.left) / box.width) * (count - 1))));
}
