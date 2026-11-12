/**
 * Petits outils d'interface. Les éléments sont construits sans innerHTML :
 * un pseudo ou un nom d'ouverture ne peut pas injecter de code.
 */
export const $ = (id) => document.getElementById(id);

/**
 * Crée un élément. `props` : class, text, on<Événement>, dataset, ou tout attribut HTML.
 * Les enfants null ou false sont ignorés.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (name === "class") node.className = value;
    else if (name === "text") node.textContent = value;
    else if (name === "dataset") Object.assign(node.dataset, value);
    else if (name.startsWith("on")) node.addEventListener(name.slice(2).toLowerCase(), value);
    else node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

export const percent = (value) => Math.round(value) + " %";

/** Remplace le contenu d'un élément. */
export function fill(node, ...children) {
  node.replaceChildren(...children.flat().filter((child) => child != null && child !== false));
}
