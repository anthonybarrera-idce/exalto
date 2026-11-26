import { contextBridge, ipcRenderer, webUtils } from "electron"

const on = (channel: string) => (cb: (v: any) => void) => {
  const fn = (_e: unknown, v: any) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => {
    ipcRenderer.removeListener(channel, fn)
  }
}

const api = {
  env: (): Promise<{ serviceDir: string; outDir: string; pythonReady: boolean; tesseractReady: boolean; version: string }> => ipcRenderer.invoke("env:info"),
  setTheme: (mode: "system" | "light" | "dark") => ipcRenderer.invoke("theme:set", mode),
  isDark: () => ipcRenderer.invoke("theme:isDark"),
  setLanguage: (lang: "es" | "en") => ipcRenderer.invoke("language:set", lang),
  onThemeChanged: on("theme:changed"),
  pickDecks: () => ipcRenderer.invoke("files:pickDecks"),
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  convert: (o: unknown) => ipcRenderer.invoke("convert:start", o),
  cancel: () => ipcRenderer.invoke("convert:cancel"),
  onLog: on("convert:log"),
  onDone: on("convert:done"),
  listHymns: () => ipcRenderer.invoke("hymns:list"),
  getHymn: (slug: string) => ipcRenderer.invoke("hymns:get", slug),
  readText: (slug: string, file: string): Promise<string> => ipcRenderer.invoke("hymns:readText", slug, file),
  readBinary: (slug: string, file: string): Promise<Uint8Array> => ipcRenderer.invoke("hymns:readBinary", slug, file),
  googleSignIn: (): Promise<string> => ipcRenderer.invoke("auth:google"),
  saveLyrics: (slug: string, text: string, sections: unknown) => ipcRenderer.invoke("hymns:saveLyrics", slug, text, sections),
  saveTo: (slug: string, names: string[]) => ipcRenderer.invoke("hymns:saveTo", slug, names),
  ensureTones: (slug: string): Promise<boolean> => ipcRenderer.invoke("hymns:ensureTones", slug),
  saveDetails: (slug: string, patch: Record<string, unknown>) => ipcRenderer.invoke("hymns:saveDetails", slug, patch),
  saveSyllables: (slug: string, pages: unknown[]) => ipcRenderer.invoke("hymns:saveSyllables", slug, pages),
  saveEdits: (slug: string, pages: unknown[], respellFrom: number | null) => ipcRenderer.invoke("hymns:saveEdits", slug, pages, respellFrom),
  /** Asks to confirm, then moves the import to the Trash; false if the user cancelled. */
  deleteHymn: (slug: string): Promise<boolean> => ipcRenderer.invoke("hymns:delete", slug),
  /** Asks to confirm, then reads the hymn again from its saved slides with Claude or Gemini (a background job like a conversion); false if cancelled. */
  reprocessHymn: (slug: string, engine: "claude" | "gemini", correct: boolean): Promise<boolean> =>
    ipcRenderer.invoke("hymns:reprocess", slug, engine, correct),
  /** Whether a Claude / Gemini key is saved (last 4 characters only; the key never comes back). */
  keyStatus: (): Promise<{ secure: boolean; anthropic: { last4: string } | null; gemini: { last4: string } | null }> =>
    ipcRenderer.invoke("keys:status"),
  setKey: (provider: "anthropic" | "gemini", value: string): Promise<boolean> => ipcRenderer.invoke("keys:set", provider, value),
  clearKey: (provider: "anthropic" | "gemini"): Promise<boolean> => ipcRenderer.invoke("keys:clear", provider),
  /** Ask the saved AI key's provider for spelling fixes to these lyric lines (main process makes the call). */
  aiSpellcheck: (lines: string[], lyricsLang: "es" | "en"): Promise<import("../main/spellcheck").SpellResult> =>
    ipcRenderer.invoke("lyrics:aiSpellcheck", lines, lyricsLang),
  reveal: (slug: string) => ipcRenderer.invoke("hymns:reveal", slug),
  revealFolder: (): Promise<string> => ipcRenderer.invoke("hymns:revealFolder"),
}

contextBridge.exposeInMainWorld("studio", api)
export type StudioApi = typeof api
