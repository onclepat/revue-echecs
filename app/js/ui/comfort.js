/**
 * Confort : thème (système, clair, sombre) et sons de coup.
 * Les sons sont synthétisés par le navigateur : aucun fichier audio, aucune licence tierce.
 */
import { preferences } from "../data/store.js";

const THEMES = ["system", "light", "dark"];
const THEME_ICON = { system: "◐", light: "☀", dark: "☾" };
const THEME_NAME = { system: "Thème : système", light: "Thème : clair", dark: "Thème : sombre" };

export function initTheme(button) {
  let theme = preferences.get("theme", "system");
  const apply = () => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    button.textContent = THEME_ICON[theme];
    button.title = THEME_NAME[theme];
    button.setAttribute("aria-label", THEME_NAME[theme]);
  };
  button.addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    preferences.set("theme", theme);
    apply();
  });
  apply();
}

let audio = null;
let soundOn = preferences.get("sound", true);

export function initSound(button) {
  const apply = () => {
    button.textContent = soundOn ? "♪" : "∅";
    button.title = soundOn ? "Sons activés" : "Sons coupés";
    button.setAttribute("aria-label", button.title);
  };
  button.addEventListener("click", () => {
    soundOn = !soundOn;
    preferences.set("sound", soundOn);
    apply();
    if (soundOn) playMove(false);
  });
  apply();
}

/** Son bref de pièce posée ; plus grave et plus appuyé pour une prise. */
export function playMove(capture) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(capture ? 150 : 240, now);
    oscillator.frequency.exponentialRampToValueAtTime(capture ? 60 : 110, now + 0.08);
    gain.gain.setValueAtTime(capture ? 0.5 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (capture ? 0.14 : 0.09));
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  } catch {
    // Son indisponible (navigateur sans audio) : l'outil reste utilisable.
  }
}
