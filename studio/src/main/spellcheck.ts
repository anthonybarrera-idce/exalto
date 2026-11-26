/**
 * AI spellcheck of hymn lyrics, run from the main process so the saved API key never reaches the
 * screen. The renderer sends the lyric lines; this asks Claude (or Gemini when that's the only key)
 * for spelling, accent and run-together-word fixes and returns them as suggestions to review.
 * Nothing is changed here: the Lyrics page applies only the fixes the user accepts.
 *
 * Calls go over HTTPS with Electron's network stack (net.fetch), which follows the Mac's proxy and
 * certificate settings (work networks often inspect HTTPS). No key, prompt or response is logged; a
 * small diagnostics file records only each step's timing and HTTP status.
 */
import { appendFile } from "node:fs/promises"
import { net } from "electron"

let logFile: string | null = null
/** Where to write step timings (userData/logs/ai-spellcheck.log). */
export function setSpellcheckLog(path: string) {
  logFile = path
}
function trace(step: string) {
  if (logFile) appendFile(logFile, `${new Date().toISOString()} ${step}\n`).catch(() => {})
}

export type SpellProvider = "anthropic" | "gemini"
export type Suggestion = { line: number; original: string; suggestion: string; reason: string }
export type SpellErrorCode = "noKey" | "offline" | "timeout" | "badKey" | "rateLimit" | "overloaded" | "refused" | "badResponse" | "tooLong" | "failed"
export type SpellResult =
  | { ok: true; provider: SpellProvider; suggestions: Suggestion[] }
  | { ok: false; provider: SpellProvider | null; code: SpellErrorCode; detail?: string }

export const CLAUDE_MODEL = "claude-sonnet-5-5"
export const GEMINI_MODEL = "gemini-3.5-flash"
const MAX_LINES = 400
const TIMEOUT_MS = 40_000 // per request; Gemini may try two models

/** The same shape for Gemini's responseSchema (OpenAPI subset: no additionalProperties). */
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "integer" },
          original: { type: "string" },
          suggestion: { type: "string" },
          reason: { type: "string" },
        },
        required: ["line", "original", "suggestion", "reason"],
      },
    },
  },
  required: ["suggestions"],
}

const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "integer", description: "Line number as given in the input" },
          original: { type: "string", description: "The word exactly as it appears in that line" },
          suggestion: { type: "string", description: "The corrected word (two words if a space was missing)" },
          reason: { type: "string", description: "Short reason, in the UI language" },
        },
        required: ["line", "original", "suggestion", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const

export function buildPrompt(lines: string[], lyricsLang: "es" | "en", uiLang: "es" | "en") {
  const langName = lyricsLang === "en" ? "English" : "Spanish"
  const system = [
    `You proofread ${langName} hymn lyrics that were read from slides by OCR or a PDF text layer.`,
    "Find only spelling mistakes: wrong or missing letters, missing or wrong accents (á é í ó ú ñ ü), and words run together without a space (for example \"tunombre\" -> \"tu nombre\").",
    "Never change wording, word order, meaning, punctuation style, capitalization style, line breaks or theology. Archaic or poetic forms common in hymns (\"Tú\", \"vos\", \"temed\", \"oh\", \"thee\", \"thou\") are correct: leave them.",
    "Proper names and capitalized pronouns for God are intentional.",
    "Report each mistake once per line: the line number, the word exactly as written in that line, the corrected word, and a short reason.",
    `Write the reasons in ${uiLang === "en" ? "English" : "Spanish"}, at most eight words.`,
    "If there are no mistakes, return an empty list.",
  ].join("\n")
  const user = `Lyrics (one numbered line each):\n\n${lines.map((l, i) => `${i + 1}: ${l}`).join("\n")}`
  return { system, user }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** Whether `word` occurs in `line` as a whole word (letters on either side don't count). */
export function hasWord(line: string, word: string) {
  return new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(word)}(?![\\p{L}\\p{M}])`, "u").test(line)
}

/**
 * Keep only suggestions that point at a real word on a real line and actually change it.
 * `line` is 1-based in the model's answer and 0-based in what we return.
 */
export function parseSuggestions(raw: unknown, lines: string[]): Suggestion[] {
  let data = raw
  if (typeof data === "string") {
    const text = data.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "")
    data = JSON.parse(text)
  }
  const list = Array.isArray(data) ? data : (data as { suggestions?: unknown })?.suggestions
  if (!Array.isArray(list)) throw new Error("No suggestions list")
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const s of list) {
    if (!s || typeof s !== "object") continue
    const { line, original, suggestion, reason } = s as Record<string, unknown>
    const n = Number(line) - 1
    if (!Number.isInteger(n) || n < 0 || n >= lines.length) continue
    if (typeof original !== "string" || typeof suggestion !== "string") continue
    const from = original.trim()
    const to = suggestion.trim().replace(/\s+/g, " ")
    if (!from || !to || from === to || from.length > 60 || to.length > 80) continue
    if (!hasWord(lines[n], from)) continue
    // Spelling only: the fix must stay close to the word (no rewrites of whole phrases).
    if (to.split(" ").length > 3 || from.split(" ").length > 2) continue
    const key = `${n}\u0000${from}\u0000${to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ line: n, original: from, suggestion: to, reason: typeof reason === "string" ? reason.trim().slice(0, 160) : "" })
  }
  return out.sort((a, b) => a.line - b.line)
}

function httpError(provider: SpellProvider, status: number, body: string): SpellResult {
  if (status === 401 || status === 403) return { ok: false, provider, code: "badKey" }
  // Gemini reports a bad key as 400 API_KEY_INVALID.
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return { ok: false, provider, code: "badKey" }
  if (status === 429) return { ok: false, provider, code: "rateLimit" }
  if (status === 529 || status === 503 || status >= 500) return { ok: false, provider, code: "overloaded" }
  if (status === 413) return { ok: false, provider, code: "tooLong" }
  return { ok: false, provider, code: "failed", detail: `HTTP ${status}` }
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  const host = new URL(url).host
  trace(`request ${host}`)
  try {
    const res = await net.fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal })
    trace(`response ${host} HTTP ${res.status} after ${Date.now() - t0}ms`)
    const text = await res.text()
    trace(`body read (${text.length} chars) after ${Date.now() - t0}ms`)
    return { status: res.status, text }
  } catch (e) {
    trace(`failed ${host} after ${Date.now() - t0}ms: ${(e as Error).name} ${(e as Error).message.slice(0, 120)}`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function askClaude(key: string, lines: string[], lyricsLang: "es" | "en", uiLang: "es" | "en"): Promise<SpellResult> {
  const { system, user } = buildPrompt(lines, lyricsLang, uiLang)
  const { status, text } = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" },
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // On a safety decline the API retries on a fallback model inside the same call.
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    },
  )
  if (status !== 200) {
    // The API's error type/message help diagnose (never the key); keep it short.
    trace(`anthropic error: ${text.slice(0, 300).replace(/\s+/g, " ")}`)
    return httpError("anthropic", status, text)
  }
  const msg = JSON.parse(text) as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (msg.stop_reason === "refusal") return { ok: false, provider: "anthropic", code: "refused" }
  if (msg.stop_reason === "max_tokens") return { ok: false, provider: "anthropic", code: "tooLong" }
  const out = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
  return { ok: true, provider: "anthropic", suggestions: parseSuggestions(out, lines) }
}

/**
 * Gemini models to try in order. Google often answers 503 "high demand" for its newest model; the
 * older Flash is usually free then. Each model has its own way to keep thinking short.
 */
const GEMINI_MODELS: { id: string; thinking: Record<string, unknown> }[] = [
  { id: GEMINI_MODEL, thinking: { thinkingLevel: "low" } },
  { id: "gemini-2.5-flash", thinking: { thinkingBudget: 0 } },
]

async function askGemini(key: string, lines: string[], lyricsLang: "es" | "en", uiLang: "es" | "en"): Promise<SpellResult> {
  const { system, user } = buildPrompt(lines, lyricsLang, uiLang)
  let last: SpellResult = { ok: false, provider: "gemini", code: "overloaded" }
  for (const [i, model] of GEMINI_MODELS.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500))
    let reply: { status: number; text: string }
    try {
      reply = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`,
        { "x-goog-api-key": key },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_SCHEMA,
            temperature: 0,
            maxOutputTokens: 8192,
            // Gemini "thinks" before answering by default, which made a 24-line check take over 45 s.
            // Spelling needs little reasoning: keep it short so the answer comes back in seconds.
            thinkingConfig: model.thinking,
          },
        },
      )
    } catch (e) {
      // No answer in time (Google sometimes holds requests when a model is busy): try the next model.
      if ((e as Error).name !== "AbortError") throw e
      last = { ok: false, provider: "gemini", code: "timeout" }
      continue
    }
    const { status, text } = reply
    if (status !== 200) {
      trace(`gemini ${model.id} error: ${text.slice(0, 300).replace(/\s+/g, " ")}`)
      last = httpError("gemini", status, text)
      // Busy, rate-limited or model not available: try the next model. Anything else (bad key…) is final.
      if (status === 503 || status === 429 || status === 404 || status >= 500) continue
      return last
    }
    const res = JSON.parse(text) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } }
    const cand = res.candidates?.[0]
    if (res.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") return { ok: false, provider: "gemini", code: "refused" }
    if (cand?.finishReason === "MAX_TOKENS") return { ok: false, provider: "gemini", code: "tooLong" }
    const out = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("")
    trace(`gemini ${model.id} answered`)
    return { ok: true, provider: "gemini", suggestions: parseSuggestions(out, lines) }
  }
  return last
}

/** Claude when its key is saved (cheaper and faster for this), else Gemini. */
export function pickProvider(keys: Partial<Record<SpellProvider, string>>): SpellProvider | null {
  return keys.anthropic ? "anthropic" : keys.gemini ? "gemini" : null
}

export async function spellcheck(
  keys: Partial<Record<SpellProvider, string>>,
  rawLines: unknown,
  lyricsLang: unknown,
  uiLang: unknown,
): Promise<SpellResult> {
  const provider = pickProvider(keys)
  if (!provider) return { ok: false, provider: null, code: "noKey" }
  const lines = Array.isArray(rawLines) ? rawLines.map((l) => String(l ?? "").slice(0, 300)) : []
  if (!lines.some((l) => l.trim())) return { ok: true, provider, suggestions: [] }
  if (lines.length > MAX_LINES) return { ok: false, provider, code: "tooLong" }
  trace(`start ${provider} lines=${lines.length}`)
  const ll = lyricsLang === "en" ? "en" : "es"
  const ul = uiLang === "en" ? "en" : "es"
  try {
    return provider === "anthropic" ? await askClaude(keys.anthropic!, lines, ll, ul) : await askGemini(keys.gemini!, lines, ll, ul)
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    if (err instanceof SyntaxError || /No suggestions list/.test(err.message)) return { ok: false, provider, code: "badResponse" }
    // No answer in time is a busy or slow service, not a lost connection.
    if (err.name === "AbortError") return { ok: false, provider, code: "timeout" }
    // fetch() rejects with TypeError("fetch failed") for DNS / connection problems.
    if (err instanceof TypeError || /ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network/i.test(`${err.message} ${err.cause?.code ?? ""}`)) {
      return { ok: false, provider, code: "offline" }
    }
    return { ok: false, provider, code: "failed" }
  }
}
