import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { studio } from "@/lib/studio"

export type ThemeMode = "system" | "light" | "dark"
type Ctx = { theme: ThemeMode; resolved: "light" | "dark"; setTheme: (m: ThemeMode) => void }
const ThemeContext = createContext<Ctx>({ theme: "system", resolved: "light", setTheme: () => {} })

function readSaved(): ThemeMode {
  try {
    return (localStorage.getItem("theme") as ThemeMode) || "system"
  } catch {
    return "system"
  }
}

/** Keeps the `dark` class, Electron's native theme (title bar, menus) and the saved choice in sync. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readSaved)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  useEffect(() => {
    studio.setTheme(theme).then(setDark)
    try {
      localStorage.setItem("theme", theme)
    } catch {}
  }, [theme])
  useEffect(() => studio.onThemeChanged(setDark), [])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return (
    <ThemeContext.Provider value={{ theme, resolved: dark ? "dark" : "light", setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
