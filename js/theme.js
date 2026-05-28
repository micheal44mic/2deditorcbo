(function initEditorTheme(namespace) {
  const THEME_STORAGE_KEY = "cbo-editor-theme";
  const DEFAULT_THEME = "dark";

  function normalizeTheme(value) {
    return String(value || "").toLowerCase() === "light" ? "light" : DEFAULT_THEME;
  }

  function readStoredTheme() {
    try {
      return normalizeTheme(window.localStorage?.getItem(THEME_STORAGE_KEY));
    } catch (error) {
      return DEFAULT_THEME;
    }
  }

  let currentTheme = readStoredTheme();

  function writeStoredTheme(theme) {
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Storage can be unavailable in private or embedded contexts.
    }
  }

  function syncThemeClass(theme) {
    const isLight = theme === "light";
    const root = document.documentElement;
    const body = document.body;

    root.dataset.cboTheme = theme;
    root.style.colorScheme = theme;

    if (body) {
      body.dataset.cboTheme = theme;
      body.classList.toggle("cbo-theme-light", isLight);
      body.classList.toggle("cbo-theme-dark", !isLight);
    }

    document.querySelectorAll(".editor-page").forEach((page) => {
      page.classList.toggle("light-stage-background", isLight);
      page.classList.toggle("dark-stage-background", !isLight);
    });
  }

  function applyEditorTheme(theme, options = {}) {
    const nextTheme = normalizeTheme(theme);
    const previousTheme = currentTheme;

    currentTheme = nextTheme;
    syncThemeClass(nextTheme);

    if (options.persist !== false) {
      writeStoredTheme(nextTheme);
    }

    if (options.dispatch !== false && previousTheme !== nextTheme) {
      window.dispatchEvent(new CustomEvent("cbo:theme-change", {
        detail: {
          previousTheme,
          source: options.source || "theme",
          theme: nextTheme,
        },
      }));
    }

    return nextTheme;
  }

  function setEditorTheme(theme, options = {}) {
    return applyEditorTheme(theme, {
      persist: options.persist !== false,
      source: options.source || "theme-set",
    });
  }

  function toggleEditorTheme(options = {}) {
    return setEditorTheme(currentTheme === "light" ? "dark" : "light", {
      persist: options.persist !== false,
      source: options.source || "theme-toggle",
    });
  }

  function getEditorTheme() {
    return currentTheme;
  }

  namespace.editorThemeStorageKey = THEME_STORAGE_KEY;
  namespace.getEditorTheme = getEditorTheme;
  namespace.setEditorTheme = setEditorTheme;
  namespace.toggleEditorTheme = toggleEditorTheme;

  applyEditorTheme(currentTheme, {
    dispatch: false,
    persist: false,
    source: "theme-startup",
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      syncThemeClass(currentTheme);
    }, { once: true });
  } else {
    syncThemeClass(currentTheme);
  }
})(window.CBO = window.CBO || {});
