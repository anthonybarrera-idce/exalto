/**
 * Electron main process: window, theme, file pickers, and the bridge to the
 * Python converter in services/hymn-studio (run as a child process).
 */
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createReadStream, existsSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import { Readable } from "node:stream"
import { pathToFileURL } from "node:url"
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, safeStorage, shell, systemPreferences } from "electron"
import { googleSignIn } from "./google-signin"

const isDev = !!process.env.ELECTRON_RENDERER_URL
const REPO = resolve(app.getAppPath(), "..")
const SERVICE_DIR = process.env.HYMN_STUDIO_DIR ?? join(REPO, "services", "hymn-studio")
// (virtualenvs put the interpreter in Scripts\\python.exe on Windows, bin/python elsewhere)
const PYTHON = process.platform === "win32" ? join(SERVICE_DIR, ".venv", "Scripts", "python.exe") : join(SERVICE_DIR, ".venv", "bin", "python")
const OUT_DIR = join(SERVICE_DIR, "storage", "decks")

// App name in the menu bar, Dock and About panel (dev builds would otherwise say "Electron").
app.setName("Exalto Hymn Studio")
app.setAboutPanelOptions({ applicationName: "Exalto Hymn Studio", copyright: "Exalto" })

let win: BrowserWindow | null = null

// ---- UI language for native dialogs; the renderer sends the user's choice (Settings → Language).
type Lang = "es" | "en"
let lang: Lang = app.getLocale().toLowerCase().startsWith("en") ? "en" : "es"
const TEXT = {
  en: {
    pickTitle: "Choose slide decks or PDFs",
    pickFilter: "Slide decks and PDFs",
    pickButton: "Add",
    saveTitle: "Choose where to save the files",
    saveButton: "Save here",
    busy: "A conversion is already running",
    deleteTitle: "Delete “{title}”?",
    deleteDetail: "Its folder (page images, score, audio and edits) moves to the Trash, and its saved transcriptions are cleared. Copies already uploaded to Exalto aren’t affected.",
    deleteButton: "Move to Trash",
    cancel: "Cancel",
  },
  es: {
    pickTitle: "Elige presentaciones o PDF",
    pickFilter: "Presentaciones y PDF",
    pickButton: "Agregar",
    saveTitle: "Elige dónde guardar los archivos",
    saveButton: "Guardar aquí",
    busy: "Ya hay una conversión en curso",
    deleteTitle: "¿Eliminar «{title}»?",
    deleteDetail: "Su carpeta (imágenes de las páginas, partitura, audio y cambios) se mueve a la Papelera y se borran sus transcripciones guardadas. Las copias ya subidas a Exalto no cambian.",
    deleteButton: "Mover a la Papelera",
    cancel: "Cancelar",
  },
} satisfies Record<Lang, Record<string, string>>
ipcMain.handle("language:set", (_e, l: Lang) => {
  if (l === "es" || l === "en") lang = l
})

// ---- Dock icon follows the macOS appearance (System Settings → Appearance), not the app's own theme switch.
const iconPath = (dark: boolean) => join(app.getAppPath(), "build", dark ? "icon-dark.png" : "icon.png")
function systemIsDark() {
  if (process.platform === "darwin") return systemPreferences.getUserDefault("AppleInterfaceStyle", "string") === "Dark"
  return nativeTheme.shouldUseDarkColors
}
let dockDark: boolean | null = null
function updateDockIcon() {
  const dark = systemIsDark()
  if (dark === dockDark || process.platform !== "darwin") return
  const file = iconPath(dark)
  if (existsSync(file)) app.dock?.setIcon(file)
  dockDark = dark
}
if (process.platform === "darwin") {
  systemPreferences.subscribeNotification("AppleInterfaceThemeChangedNotification", updateDockIcon)
}
nativeTheme.on("updated", updateDockIcon)
let job: ChildProcess | null = null

// Serve converter output (page images, audio) to the renderer without opening file://.
protocol.registerSchemesAsPrivileged([
  { scheme: "studio", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
])

function inOutDir(p: string) {
  const full = resolve(OUT_DIR, p)
  if (!full.startsWith(OUT_DIR)) throw new Error("Path outside the output folder")
  return full
}

const MIME: Record<string, string> = {
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".mid": "audio/midi",
  ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".musicxml": "application/xml",
}

/** Answer an HTTP Range request ("bytes=start-end", "bytes=start-" or "bytes=-suffix") from a file. */
async function serveRange(file: string, range: string): Promise<Response> {
  const size = (await stat(file)).size
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  let start = 0
  let end = size - 1
  if (m && m[1]) {
    start = Number(m[1])
    if (m[2]) end = Math.min(Number(m[2]), size - 1)
  } else if (m && m[2]) {
    start = Math.max(0, size - Number(m[2]))
  }
  const headers = new Headers({
    "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
  })
  if (!m || start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`)
  headers.set("Content-Length", String(end - start + 1))
  const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream
  return new Response(body, { status: 206, headers })
}

function createWindow() {
  updateDockIcon()
  win = new BrowserWindow({
    icon: iconPath(systemIsDark()),
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  })
  if (isDev) win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else win.loadFile(join(__dirname, "../renderer/index.html"))
}

app.whenReady().then(() => {
  protocol.handle("studio", async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "")
    // Audio can only seek (measure buttons, clicks on the score) when byte ranges are served;
    // without them Chromium restarts the track at 0:00.
    const range = req.headers.get("range")
    if (range) return serveRange(inOutDir(rel), range)
    const res = await net.fetch(pathToFileURL(inOutDir(rel)).toString(), { headers: req.headers })
    // Let the app's Web Audio mixer read these files (it can't process cross-origin audio otherwise).
    const headers = new Headers(res.headers)
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Accept-Ranges", "bytes")
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  })
  createWindow()
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit())

// ---- theme: "system" | "light" | "dark"
ipcMain.handle("theme:set", (_e, mode: "system" | "light" | "dark") => {
  nativeTheme.themeSource = mode
  return nativeTheme.shouldUseDarkColors
})
nativeTheme.on("updated", () => win?.webContents.send("theme:changed", nativeTheme.shouldUseDarkColors))
ipcMain.handle("theme:isDark", () => nativeTheme.shouldUseDarkColors)

// ---- environment
ipcMain.handle("env:info", () => ({
  serviceDir: SERVICE_DIR,
  outDir: OUT_DIR,
  pythonReady: existsSync(PYTHON),
  version: app.getVersion(),
}))

ipcMain.handle("files:pickDecks", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: TEXT[lang].pickTitle,
    message: TEXT[lang].pickTitle,
    buttonLabel: TEXT[lang].pickButton,
    properties: ["openFile", "multiSelections"],
    filters: [{ name: TEXT[lang].pickFilter, extensions: ["pptx", "pdf", "txt"] }],
  })
  return r.canceled ? [] : r.filePaths
})

// ---- API keys for the Claude and Gemini readers. Encrypted with the OS (macOS Keychain, Windows
// DPAPI) in the app's data folder; the screen only ever sees whether one is saved and its last 4
// characters. The converter gets them as environment variables for the run.
type KeyProvider = "anthropic" | "gemini"
const KEY_ENV: Record<KeyProvider, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" }
const keysFile = () => join(app.getPath("userData"), "api-keys.json")
async function readKeys(): Promise<Partial<Record<KeyProvider, string>>> {
  if (!existsSync(keysFile()) || !safeStorage.isEncryptionAvailable()) return {}
  const stored = JSON.parse(await readFile(keysFile(), "utf8")) as Partial<Record<KeyProvider, string>>
  const out: Partial<Record<KeyProvider, string>> = {}
  for (const p of Object.keys(KEY_ENV) as KeyProvider[]) {
    const v = stored[p]
    if (!v) continue
    try {
      out[p] = safeStorage.decryptString(Buffer.from(v, "base64"))
    } catch {
      // saved under another OS account or machine: treat as not set
    }
  }
  return out
}
async function writeKeys(keys: Partial<Record<KeyProvider, string>>) {
  const enc: Partial<Record<KeyProvider, string>> = {}
  for (const [p, v] of Object.entries(keys) as [KeyProvider, string][]) {
    if (v) enc[p] = safeStorage.encryptString(v).toString("base64")
  }
  await mkdir(app.getPath("userData"), { recursive: true })
  await writeFile(keysFile(), JSON.stringify(enc), { mode: 0o600 })
}
ipcMain.handle("keys:status", async () => {
  const keys = await readKeys()
  return {
    secure: safeStorage.isEncryptionAvailable(),
    anthropic: keys.anthropic ? { last4: keys.anthropic.slice(-4) } : null,
    gemini: keys.gemini ? { last4: keys.gemini.slice(-4) } : null,
  }
})
ipcMain.handle("keys:set", async (_e, provider: KeyProvider, value: string) => {
  if (!(provider in KEY_ENV)) throw new Error("Unknown provider")
  if (!safeStorage.isEncryptionAvailable()) throw new Error("This computer can't store keys securely")
  const key = String(value ?? "").trim()
  if (key.length < 20 || /\s/.test(key)) throw new Error("That doesn't look like an API key")
  await writeKeys({ ...(await readKeys()), [provider]: key })
  return true
})
ipcMain.handle("keys:clear", async (_e, provider: KeyProvider) => {
  const keys = await readKeys()
  delete keys[provider]
  await writeKeys(keys)
  return true
})

// ---- convert: runs `python -m hymn_processor.cli deck …` and streams its log lines
type ConvertOptions = { inputs: string[]; engine: string; hymnal: string; tempo: number; correct: boolean }
ipcMain.handle("convert:start", async (_e, o: ConvertOptions) => {
  // Keys saved in Settings win over the shell's and the service .env's.
  const keyEnv: Record<string, string> = {}
  for (const [p, v] of Object.entries(await readKeys()) as [KeyProvider, string][]) keyEnv[KEY_ENV[p]] = v
  if (job) throw new Error(TEXT[lang].busy)
  const args = ["-m", "hymn_processor.cli", "deck", ...o.inputs, "--out", OUT_DIR, "--engine", o.engine,
    "--hymnal", o.hymnal, "--tempo", String(o.tempo)]
  if (!o.correct) args.push("--no-correct")
  job = spawn(PYTHON, args, { cwd: SERVICE_DIR, env: { ...process.env, ...keyEnv, PYTHONPATH: SERVICE_DIR, PYTHONUNBUFFERED: "1" } })
  const send = (line: string) => line.trim() && win?.webContents.send("convert:log", line)
  let buf = ""
  const onData = (d: Buffer) => {
    buf += d.toString()
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    lines.forEach(send)
  }
  job.stdout?.on("data", onData)
  job.stderr?.on("data", onData)
  job.on("close", (code) => {
    send(buf)
    job = null
    win?.webContents.send("convert:done", code)
  })
  return true
})
ipcMain.handle("convert:cancel", () => {
  job?.kill()
  return true
})

// ---- results
ipcMain.handle("hymns:list", async () => {
  if (!existsSync(OUT_DIR)) return []
  const out = []
  for (const slug of await readdir(OUT_DIR)) {
    const review = join(OUT_DIR, slug, "review.json")
    if (!existsSync(review)) continue
    const r = JSON.parse(await readFile(review, "utf8"))
    out.push({ slug, ...r, updatedAt: (await stat(review)).mtimeMs })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
})

ipcMain.handle("hymns:get", async (_e, slug: string) => {
  const dir = inOutDir(slug)
  const read = async (f: string) => JSON.parse(await readFile(join(dir, f), "utf8"))
  const files = await Promise.all(
    (await readdir(dir)).filter((f) => !f.startsWith(".")).map(async (f) => ({ name: f, size: (await stat(join(dir, f))).size })),
  )
  return {
    slug,
    review: await read("review.json"),
    hymn: await read("hymn.json"),
    transcription: await read("transcription.json"),
    lyricsText: await readFile(join(dir, "lyrics.txt"), "utf8"),
    files: files.filter((f) => f.name !== "pages"),
  }
})

ipcMain.handle("hymns:readText", async (_e, slug: string, file: string) =>
  readFile(join(inOutDir(slug), basename(file)), "utf8"),
)

ipcMain.handle("auth:google", () => googleSignIn(lang))

// Raw bytes of an output file, for uploading to Firebase Storage from the renderer.
ipcMain.handle("hymns:readBinary", async (_e, slug: string, file: string) =>
  new Uint8Array(await readFile(join(inOutDir(slug), basename(file)))),
)

ipcMain.handle("hymns:saveLyrics", async (_e, slug: string, text: string, sections: unknown) => {
  const dir = inOutDir(slug)
  await writeFile(join(dir, "lyrics.txt"), text)
  const hymn = JSON.parse(await readFile(join(dir, "hymn.json"), "utf8"))
  hymn.lyrics = sections
  await writeFile(join(dir, "hymn.json"), JSON.stringify(hymn, null, 2))
  return true
})

// Save syllables edited on the notes, then rewrite the MusicXML/MIDI from them.
ipcMain.handle("hymns:saveSyllables", async (_e, slug: string, pages: unknown[]) => {
  const dir = inOutDir(slug)
  const file = join(dir, "transcription.json")
  const t = JSON.parse(await readFile(file, "utf8"))
  t.pages = pages
  await writeFile(file, JSON.stringify(t, null, 2))
  await new Promise<void>((ok, fail) => {
    const p = spawn(PYTHON, ["-m", "hymn_processor.cli", "rebuild", "--dir", dir], {
      cwd: SERVICE_DIR,
      env: { ...process.env, PYTHONPATH: SERVICE_DIR },
    })
    let log = ""
    p.stderr.on("data", (d) => (log += d))
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(log.slice(-500)))))
  })
  return true
})

// Reviewer edits to notes, key, time and tempo (settings on the first page): rebuild the score,
// recheck measures and re-render audio. respellFrom = the old key, to re-read notes under a corrected one.
ipcMain.handle("hymns:saveEdits", async (_e, slug: string, pages: unknown[], respellFrom: number | null) => {
  const dir = inOutDir(slug)
  const file = join(dir, "transcription.json")
  const t = JSON.parse(await readFile(file, "utf8"))
  t.pages = pages
  await writeFile(file, JSON.stringify(t, null, 2))
  const args = ["-m", "hymn_processor.cli", "edit", "--dir", dir]
  if (typeof respellFrom === "number") args.push("--respell-from", String(respellFrom))
  await new Promise<void>((ok, fail) => {
    const p = spawn(PYTHON, args, { cwd: SERVICE_DIR, env: { ...process.env, PYTHONPATH: SERVICE_DIR } })
    let log = ""
    p.stderr.on("data", (d) => (log += d))
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(log.slice(-500)))))
  })
  return true
})

// Hymn details (hymnal, number, title, author, …) live in hymn.json next to the lyrics.
const DETAIL_KEYS = ["title", "hymnalId", "number", "label", "author", "language", "tags", "repeatChorus"]
ipcMain.handle("hymns:saveDetails", async (_e, slug: string, patch: Record<string, unknown>) => {
  const file = join(inOutDir(slug), "hymn.json")
  const hymn = JSON.parse(await readFile(file, "utf8"))
  for (const k of DETAIL_KEYS) if (k in patch) hymn[k] = patch[k]
  await writeFile(file, JSON.stringify(hymn, null, 2))
  return hymn
})

// Plain-tone ("just notes") tracks for hymns converted before they existed: render once on demand.
ipcMain.handle("hymns:ensureTones", async (_e, slug: string) => {
  const dir = inOutDir(slug)
  if (existsSync(join(dir, `${slug}-tone-soprano.wav`))) return true
  await new Promise<void>((ok, fail) => {
    const p = spawn(PYTHON, ["-m", "hymn_processor.cli", "tones", "--dir", dir], {
      cwd: SERVICE_DIR,
      env: { ...process.env, PYTHONPATH: SERVICE_DIR },
    })
    let log = ""
    p.stderr.on("data", (d) => (log += d))
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(log.slice(-400)))))
  })
  return true
})

ipcMain.handle("hymns:saveTo", async (_e, slug: string, names: string[]) => {
  const r = await dialog.showOpenDialog(win!, {
    title: TEXT[lang].saveTitle,
    message: TEXT[lang].saveTitle,
    buttonLabel: TEXT[lang].saveButton,
    properties: ["openDirectory", "createDirectory"],
  })
  if (r.canceled) return null
  const dest = join(r.filePaths[0], slug)
  await mkdir(dest, { recursive: true })
  for (const n of names) await cp(join(inOutDir(slug), basename(n)), join(dest, basename(n)))
  return dest
})

// ---- delete an import: its folder goes to the Trash (recoverable); cached page transcriptions
// (.cache/<engine>/<sha1 of the page image>.json) and its entry in the hymns.json manifest go too.
ipcMain.handle("hymns:delete", async (_e, slug: string) => {
  if (job) throw new Error(TEXT[lang].busy)
  const dir = inOutDir(slug)
  if (dir === OUT_DIR || basename(dir).startsWith(".") || !existsSync(join(dir, "review.json"))) throw new Error("Not an imported hymn")
  const title = JSON.parse(await readFile(join(dir, "review.json"), "utf8")).title || slug
  const t = TEXT[lang]
  const { response } = await dialog.showMessageBox(win!, {
    type: "warning",
    message: t.deleteTitle.replace("{title}", title),
    detail: t.deleteDetail,
    buttons: [t.deleteButton, t.cancel],
    defaultId: 1,
    cancelId: 1,
  })
  if (response !== 0) return false
  const pagesDir = join(dir, "pages")
  const shas = existsSync(pagesDir)
    ? await Promise.all((await readdir(pagesDir)).map(async (f) => createHash("sha1").update(await readFile(join(pagesDir, f))).digest("hex")))
    : []
  await shell.trashItem(dir)
  const cacheDir = join(OUT_DIR, ".cache")
  if (existsSync(cacheDir)) {
    for (const engine of await readdir(cacheDir)) {
      for (const sha of shas) await rm(join(cacheDir, engine, `${sha}.json`), { force: true })
    }
  }
  const manifest = join(OUT_DIR, "hymns.json")
  if (existsSync(manifest)) {
    const list = JSON.parse(await readFile(manifest, "utf8"))
    if (Array.isArray(list) && list.some((h) => h?.id === slug)) {
      await writeFile(manifest, JSON.stringify(list.filter((h) => h?.id !== slug), null, 2))
    }
  }
  return true
})

ipcMain.handle("hymns:reveal", (_e, slug: string) => shell.showItemInFolder(join(inOutDir(slug), "hymn.json")))
ipcMain.handle("hymns:revealFolder", async () => {
  await mkdir(OUT_DIR, { recursive: true })
  return shell.openPath(OUT_DIR)
})

// Dev-only: STUDIO_SNAPSHOT=<dir> screenshots every screen in light and dark, then quits.
// STUDIO_SNAPSHOT_LANG=es|en picks the UI language (default en: the steps below click English labels).
// STUDIO_SNAPSHOT_GATE=1 only captures the first screen (the sign-in gate when signed out), light and dark.
if (process.env.STUDIO_SNAPSHOT) {
  const dir = process.env.STUDIO_SNAPSHOT
  const snapLang = process.env.STUDIO_SNAPSHOT_LANG === "es" ? "es" : "en"
  app.whenReady().then(() => {
    const w = BrowserWindow.getAllWindows()[0]
    // Save the language the way Settings does, then reload so the app starts in it.
    w.webContents.once("did-finish-load", async () => {
      await w.webContents.executeJavaScript(`localStorage.setItem("language", ${JSON.stringify(snapLang)})`)
      w.webContents.once("did-finish-load", run)
      w.webContents.reload()
    })
    const run = async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const click = (label: string) =>
        w.webContents.executeJavaScript(
          `[...document.querySelectorAll("button")].find(b => (b.textContent.trim() || b.getAttribute("aria-label")) === ${JSON.stringify(label)})?.click()`,
        )
      await mkdir(dir, { recursive: true })
      await wait(1500)
      if (process.env.STUDIO_SNAPSHOT_GATE) {
        for (const theme of ["light", "dark"] as const) {
          nativeTheme.themeSource = theme
          await w.webContents.executeJavaScript(`document.documentElement.classList.toggle("dark", ${theme === "dark"})`)
          await wait(600)
          await writeFile(join(dir, `${snapLang}-gate-${theme}.png`), (await w.webContents.capturePage()).toPNG())
        }
        app.quit()
        return
      }
      // Pick a hymn that has music (STUDIO_SNAPSHOT_HYMN), so Practice and Review have something to show.
      const pick = process.env.STUDIO_SNAPSHOT_HYMN ?? "te-adoro-a-ti"
      await w.webContents.executeJavaScript(`(() => {
        const s = [...document.querySelectorAll("select")].find(x => [...x.options].some(o => o.value === ${JSON.stringify(pick)}))
        if (!s) return
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(pick)})
        s.dispatchEvent(new Event("change", { bubbles: true }))
      })()`)
      await wait(1500)
      if (process.env.STUDIO_SNAPSHOT_SETTINGS) {
        // Settings only, in light and dark (needs a signed-in session that passes the access gate).
        await click("Settings")
        for (const theme of ["Light", "Dark"]) {
          await click(theme)
          await wait(900)
          await writeFile(join(dir, `${theme.toLowerCase()}-settings.png`), (await w.webContents.capturePage()).toPNG())
        }
        app.quit()
        return
      }
      if (process.env.STUDIO_SNAPSHOT_REVIEW) {
        // Review score editing: pick measure 3, select a note, step it up, change tempo; optionally save.
        const js = (s: string) => w.webContents.executeJavaScript(s)
        const shot = async (name: string) => writeFile(join(dir, name), (await w.webContents.capturePage()).toPNG())
        const firstNote = `[...document.querySelectorAll("button[title]")].find(b => b.title.includes(" · ") && b.closest(".bg-muted\\\\/50"))`
        await click("Light")
        await click("Review score")
        await wait(1200)
        await shot("review-start.png")
        await js(`[...document.querySelectorAll("button")].find(b => b.title?.startsWith("Measure 3 "))?.click()`)
        await wait(700)
        await shot("review-measure.png")
        await js(`[...document.querySelectorAll("button")].find(b => b.title?.startsWith("Measure 20 "))?.click()`)
        await wait(400)
        await js(`[...document.querySelectorAll("button[title]")].filter(b => b.title.includes(" · ") && b.closest(".bg-muted\\\\/50"))[3]?.click()`)
        await wait(900)
        await shot("review-note-page2.png")
        await js(`[...document.querySelectorAll("button")].find(b => b.title?.startsWith("Measure 3 "))?.click()`)
        await wait(400)
        const before = await js(`${firstNote}?.title`)
        await js(`${firstNote}?.click()`)
        await wait(300)
        w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Up" })
        w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Up" })
        await wait(300)
        await js(`(() => { const el = document.querySelector('input[type="number"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "96"); el.dispatchEvent(new Event("input", { bubbles: true })) })()`)
        await wait(900)
        const after = await js(`${firstNote}?.title`)
        await shot("review-edited.png")
        await js(`document.querySelector('[aria-label="Zoom in"]')?.click()`)
        await wait(600)
        await shot("review-zoomed-in.png")
        await click("Dark")
        await wait(500)
        await shot("review-edited-dark.png")
        await click("Light")
        if (process.env.STUDIO_SNAPSHOT_SAVE) {
          await click("Save changes")
          await wait(500)
          for (let i = 0; i < 120 && (await js(`!![...document.querySelectorAll("button")].find(b => b.textContent.includes("Rebuilding"))`)); i++) await wait(500)
          await wait(1500)
          await shot("review-saved.png")
        }
        await writeFile(join(dir, "review.txt"), JSON.stringify({ before, after }, null, 1))
        app.quit()
        return
      }
      for (const theme of ["Light", "Dark"]) {
        await click(theme)
        for (const page of ["Import", "Review score", "Lyrics", "Details", "Practice", "Export", "Settings"]) {
          await click(page)
          await wait(900)
          const img = await w.webContents.capturePage()
          await writeFile(join(dir, `${theme.toLowerCase()}-${page.split(" ")[0].toLowerCase()}.png`), img.toPNG())
        }
      }
      // Practice while playing, to check the score cursor follows the audio
      await click("Light")
      await click("Practice")
      await wait(1500)
      await w.webContents.executeJavaScript(`document.querySelector('[aria-label="Play"]')?.click()`)
      await wait(6000)
      await writeFile(join(dir, "practice-playing.png"), (await w.webContents.capturePage()).toPNG())
      // Loudness check: highest output over ~3 s, all voices vs one voice soloed
      const measure = () => w.webContents.executeJavaScript(`new Promise(r => { let m = 0; const id = setInterval(() => { m = Math.max(m, window.studioMixer?.peak() ?? -1) }, 20); setTimeout(() => { clearInterval(id); r(m) }, 3000) })`)
      const allPeak = await measure()
      await w.webContents.executeJavaScript(`[...document.querySelectorAll('button[title="Solo"]')][1]?.click()`)
      const soloPeak = await measure()
      await w.webContents.executeJavaScript(`[...document.querySelectorAll('button[title="Solo"]')][1]?.click()`)
      await writeFile(join(dir, "loudness.txt"), JSON.stringify({ allVoices: allPeak, altoSolo: soloPeak }))
      // Switch to "Just notes" while playing: tracks change, position carries over
      const before = await w.webContents.executeJavaScript(`document.querySelector("audio").currentTime`)
      await click("Just notes")
      await wait(3000)
      const after = await w.webContents.executeJavaScript(`(() => { const a = [...document.querySelectorAll("audio")]; return { srcs: a.map(x => x.src.split("/").pop()), t: a[0].currentTime, paused: a[0].paused } })()`)
      await writeFile(join(dir, "sound-switch.txt"), JSON.stringify({ before, after }, null, 1))
      await writeFile(join(dir, "practice-tone.png"), (await w.webContents.capturePage()).toPNG())
      await click("Piano")
      // Click a note on the score's second line: playback should jump there
      const pt = await w.webContents.executeJavaScript(`(() => {
        const r = document.querySelector('[aria-label^="Score"] svg').getBoundingClientRect()
        return { x: Math.round(r.left + r.width * 0.55), y: Math.round(r.top + 330) }
      })()`)
      w.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 })
      w.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 })
      await wait(1200)
      await writeFile(join(dir, "practice-clicked.png"), (await w.webContents.capturePage()).toPNG())
      // One-note click: switch on, click a notehead, capture the highlight while it sounds
      await w.webContents.executeJavaScript(`document.querySelector('[aria-label="Pause"]')?.click()`)
      await w.webContents.executeJavaScript(`[...document.querySelectorAll("label")].find(l => l.textContent.includes("One-note click"))?.querySelector("button")?.click()`)
      await wait(400)
      const nh = await w.webContents.executeJavaScript(`(() => {
        const heads = [...document.querySelectorAll('[aria-label="Score"] .vf-notehead')]
        const h = heads[Math.min(12, heads.length - 1)]; if (!h) return null
        h.scrollIntoView({ block: "center" }); const r = h.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (nh) {
        await wait(300)
        w.webContents.sendInputEvent({ type: "mouseDown", x: nh.x, y: nh.y, button: "left", clickCount: 1 })
        w.webContents.sendInputEvent({ type: "mouseUp", x: nh.x, y: nh.y, button: "left", clickCount: 1 })
        await wait(250)
        await writeFile(join(dir, "practice-note.png"), (await w.webContents.capturePage()).toPNG())
        const label = await w.webContents.executeJavaScript(`document.querySelector('[aria-live="polite"]')?.textContent ?? ""`)
        await writeFile(join(dir, "practice-note.txt"), label)
      }
      if (process.env.STUDIO_SNAPSHOT_EDIT) {
        // Lyrics: click a note, change its syllable, save, and capture the redrawn score
        await w.webContents.executeJavaScript(`document.querySelector('[aria-label="Pause"]')?.click()`)
        await click("Lyrics")
        await wait(2500)
        const p2 = await w.webContents.executeJavaScript(`(() => {
          const svgs = document.querySelectorAll('[aria-label^="Score"] svg'); const r = svgs[svgs.length-1].getBoundingClientRect()
          r.el = svgs[svgs.length-1]; svgs[svgs.length-1].scrollIntoView({block: "center"}); const q = svgs[svgs.length-1].getBoundingClientRect()
          return { x: Math.round(q.left + q.width * 0.3), y: Math.round(q.top + 70) }
        })()`)
        w.webContents.sendInputEvent({ type: "mouseDown", x: p2.x, y: p2.y, button: "left", clickCount: 1 })
        w.webContents.sendInputEvent({ type: "mouseUp", x: p2.x, y: p2.y, button: "left", clickCount: 1 })
        await wait(800)
        await w.webContents.executeJavaScript(`(() => {
          const el = document.getElementById("syl"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
          set.call(el, "EDITADO"); el.dispatchEvent(new Event("input", { bubbles: true }))
        })()`)
        await wait(400)
        await wait(800)
        await writeFile(join(dir, "lyrics-editing.png"), (await w.webContents.capturePage()).toPNG())
        const live = await w.webContents.executeJavaScript(
          `[...document.querySelectorAll('[aria-label="Score"] svg text')].some(t => t.textContent.includes("EDITADO"))`,
        )
        await writeFile(join(dir, "live-preview.txt"), String(live))
        if (!process.env.STUDIO_SNAPSHOT_SAVE) {
          app.quit()
          return
        }
        await click("Save to score")
        await wait(6000)
        await w.webContents.executeJavaScript(`document.querySelectorAll('[aria-label^="Score"] svg')[0]?.scrollIntoView({block: "center"})`)
        await wait(800)
        await writeFile(join(dir, "lyrics-saved.png"), (await w.webContents.capturePage()).toPNG())
      }
      app.quit()
    }
  })
}
