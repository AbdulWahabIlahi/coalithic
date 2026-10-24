import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "coalsmart.theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside a ThemeProvider");
  return ctx;
}

function readStoredTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
  } catch {
    return "system";
  }
}

function readSystemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(readSystemDark);

  // Follow OS preference changes while the "system" theme is active.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Sync the document with the resolved theme and persist the choice.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode — theme just won't persist */
    }
  }, [theme, resolved]);

  const toggle = () => setThemeState((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme: setThemeState, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
