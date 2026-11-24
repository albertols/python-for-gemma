export type Theme = "dark" | "light";
const KEY = "planner-theme";

/** The theme in force. index.html applied the saved one before first paint. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private windows can refuse storage: the choice then lasts until reload.
  }
}
