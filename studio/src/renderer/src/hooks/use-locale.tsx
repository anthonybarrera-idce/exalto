import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { en, es, tonic, type StringKey } from "@/lib/i18n"
import { DURATIONS, isRest, pretty, type Voice } from "@/lib/notes"
import { hymnalName, studio } from "@/lib/studio"

export type Language = "es" | "en"
export type LanguagePreference = Language | "system"
type Vars = Record<string, string | number>

const KEY = "language"
const TABLES: Record<Language, Record<StringKey, string>> = { en, es }

/** The OS language: English if it's English, otherwise Spanish (the church's primary language). */
function systemLanguage(): Language {
  try {
    return (navigator.languages?.[0] ?? navigator.language ?? "es").toLowerCase().startsWith("en") ? "en" : "es"
  } catch {
    return "es"
  }
}

function readSaved(): LanguagePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === "es" || v === "en" ? v : "system"
  } catch {
    return "system"
  }
}

const fill = (template: string, vars?: Vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k]))) : template

type Ctx = {
  language: Language
  preference: LanguagePreference
  setPreference: (p: LanguagePreference) => void
  t: (key: StringKey, vars?: Vars) => string
  /** Picks `<base>.one` or `<base>.other` for the count. */
  plural: (base: "import.convert" | "export.saved", count: number, vars?: Vars) => string
  /** Like `t`, but placeholders can be React nodes (bold names, code…). */
  rich: (key: StringKey, vars: Record<string, ReactNode>) => ReactNode
  /** Numbers in the current language (1,5 vs 1.5). */
  num: (n: number, digits?: number) => string
  /** "Mi♭ mayor" / "E♭ major" */
  keyName: (fifths: number) => string | undefined
  /** "E♭4", or "Silencio"/"Rest" */
  noteName: (pitch: string) => string
  /** "Negra" / "Quarter" */
  durName: (dur: number) => string
  voiceName: (v: Voice) => string
  /** Hymnal display name; "Community" is the only one that isn't a proper name. */
  hymnal: (id: string) => string
  /** Hymn status from the admin: draft, published… */
  status: (s: string | undefined) => string
}
const LocaleContext = createContext<Ctx>(null!)

const DUR_KEYS: Record<string, StringKey> = {
  Whole: "dur.whole",
  "Dotted half": "dur.dottedHalf",
  Half: "dur.half",
  "Dotted quarter": "dur.dottedQuarter",
  Quarter: "dur.quarter",
  "Dotted eighth": "dur.dottedEighth",
  Eighth: "dur.eighth",
  "Triplet eighth": "dur.tripletEighth",
  Sixteenth: "dur.sixteenth",
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<LanguagePreference>(readSaved)
  const [system, setSystem] = useState<Language>(systemLanguage)
  useEffect(() => {
    const on = () => setSystem(systemLanguage())
    window.addEventListener("languagechange", on)
    return () => window.removeEventListener("languagechange", on)
  }, [])
  const language: Language = preference === "system" ? system : preference

  useEffect(() => {
    document.documentElement.lang = language
    // Native dialogs (file pickers) are opened by the main process.
    studio.setLanguage?.(language)
  }, [language])

  const value = useMemo<Ctx>(() => {
    const table = TABLES[language]
    const t = (key: StringKey, vars?: Vars) => fill(table[key] ?? en[key], vars)
    const nf = new Map<number, Intl.NumberFormat>()
    const num = (n: number, digits = 2) => {
      if (!nf.has(digits)) nf.set(digits, new Intl.NumberFormat(language, { maximumFractionDigits: digits }))
      return nf.get(digits)!.format(n)
    }
    return {
      language,
      preference,
      setPreference: (p) => {
        try {
          if (p === "system") localStorage.removeItem(KEY)
          else localStorage.setItem(KEY, p)
        } catch {}
        setPref(p)
      },
      t,
      plural: (base, count, vars) =>
        t(`${base}.${new Intl.PluralRules(language).select(count) === "one" ? "one" : "other"}` as StringKey, { count, ...vars }),
      rich: (key, vars) => {
        const parts = (table[key] ?? en[key]).split(/\{(\w+)\}/g)
        return parts.map((p, i) => <Fragment key={i}>{i % 2 ? (vars[p] ?? `{${p}}`) : p}</Fragment>)
      },
      num,
      keyName: (fifths) => (fifths >= -6 && fifths <= 6 ? t("key.major", { tonic: tonic(fifths, language) }) : undefined),
      noteName: (p) => (isRest(p) ? t("note.rest") : pretty(p)),
      durName: (d) => {
        const known = DURATIONS.find((x) => Math.abs(x.dur - d) < 0.01)
        return known ? t(DUR_KEYS[known.label]) : t("dur.beats", { beats: num(d, 3) })
      },
      voiceName: (v) => t(`voice.${v}`),
      hymnal: (id) => (id === "community" ? t("hymnal.community") : hymnalName(id)),
      status: (st = "draft") => (st === "draft" || st === "published" || st === "archived" ? t(`status.${st}`) : st),
    }
  }, [language, preference])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)
/** Just the translate function, for components that only need strings. */
export const useT = () => useContext(LocaleContext).t
