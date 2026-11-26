/**
 * The hymn assistant's model call, made from the main process so the saved API key never reaches
 * the screen. The renderer sends the conversation and a text summary of the open hymn; the model
 * answers in words plus a list of proposed edits (structured, never applied here). The Review page
 * shows each edit as a preview the composer accepts or rejects.
 *
 * Gemini first (its best model, then cheaper ones when Google answers 503/overloaded/429), Claude
 * when only an Anthropic key is saved. Same key store, timeouts and error codes as the AI spellcheck.
 * No key, prompt or response is logged.
 */
import { appendFile } from "node:fs/promises"
import { net } from "electron"

let logFile: string | null = null
/** Where to write per-request model, HTTP status and timing (userData/logs/ai-chat.log). Never content or keys. */
export function setChatLog(path: string) {
  logFile = path
}
function trace(step: string) {
  if (logFile) appendFile(logFile, `${new Date().toISOString()} ${step}\n`).catch(() => {})
}

export type ChatProvider = "anthropic" | "gemini"
export type ChatErrorCode = "noKey" | "offline" | "timeout" | "badKey" | "rateLimit" | "overloaded" | "refused" | "badResponse" | "tooLong" | "failed"
export type ChatTurn = { role: "user" | "assistant"; text: string }
/** One proposed change. Fields used depend on `type`; the renderer validates them against the score. */
export type ChatEdit = {
  type: "note" | "syllable" | "lyricLine" | "transpose" | "tempo"
  summary: string
  measure?: number
  voice?: string
  index?: number
  pitch?: string
  dur?: number
  text?: string
  syllabic?: string
  section?: number
  line?: number
  from?: string
  to?: string
  toKey?: number
  direction?: "up" | "down" | "nearest"
  bpm?: number
}
export type ChatResult =
  | { ok: true; provider: ChatProvider; model: string; reply: string; edits: ChatEdit[] }
  | { ok: false; provider: ChatProvider | null; code: ChatErrorCode; detail?: string }

/**
 * Used when the model list can't be read. Google renames and retires models often (2.5 Flash is closed
 * to new keys), so the real order comes from its model list: see geminiModels().
 */
export const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3-flash"]
type GeminiModel = { id: string; thinking: Record<string, unknown> }
const thinkingFor = (id: string): Record<string, unknown> =>
  /^gemini-2\./.test(id) ? { thinkingBudget: 1024 } : { thinkingLevel: /-pro/.test(id) ? "medium" : "low" }

/**
 * Gemini models this key can call, best first: the newest Pro (its newest Pro is often only a
 * "-preview"; older stable Pros get closed to new keys), then Flash models newest first (cheaper;
 * Google often answers 503 "high demand" for the newest, and an older one is usually free then).
 * Lite, image, dated previews and other special-purpose variants are left out.
 */
export function rankGeminiModels(names: string[]): string[] {
  const parsed = names
    .map((n) => n.replace(/^models\//, ""))
    .map((id) => ({ id, m: /^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-preview)?$/.exec(id) }))
    .filter((x): x is { id: string; m: RegExpExecArray } => !!x.m)
    .map(({ id, m }) => ({ id, v: Number(m[1]), tier: m[2], preview: !!m[3] }))
  // Newest version first; at the same version the stable one before its preview.
  const order = (a: { v: number; preview: boolean }, b: { v: number; preview: boolean }) => b.v - a.v || Number(a.preview) - Number(b.preview)
  const pro = parsed.filter((x) => x.tier === "pro").sort(order)
  const flash = parsed.filter((x) => x.tier === "flash" && !x.preview).sort(order)
  return [...pro.slice(0, 2), ...flash.slice(0, 4)].map((x) => x.id)
}

let modelCache: { at: number; ids: string[] } | null = null
async function geminiModels(key: string): Promise<GeminiModel[]> {
  if (!modelCache || Date.now() - modelCache.at > 6 * 3600_000) {
    let ids: string[] = []
    try {
      const res = await net.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": key } })
      if (res.ok) {
        const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
        ids = rankGeminiModels((data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name))
      }
      trace(`gemini models HTTP ${res.status}: ${ids.join(", ") || "none usable"}`)
    } catch (e) {
      trace(`gemini models failed: ${(e as Error).name}`)
    }
    if (!ids.length) return GEMINI_FALLBACK_MODELS.map((id) => ({ id, thinking: thinkingFor(id) }))
    modelCache = { at: Date.now(), ids }
  }
  return modelCache.ids.map((id) => ({ id, thinking: thinkingFor(id) }))
}
export const CLAUDE_CHAT_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"]
const TIMEOUT_MS = 60_000 // per model; a busy model can hold a request without answering
const MAX_TURNS = 40
const MAX_CONTEXT = 120_000 // characters of hymn summary

const EDIT_PROPS = {
  type: { type: "string", enum: ["note", "syllable", "lyricLine", "transpose", "tempo"] },
  summary: { type: "string", description: "One short line describing the change, in the UI language" },
  measure: { type: "integer", description: "note/syllable: measure number as listed (1-based)" },
  voice: { type: "string", enum: ["soprano", "alto", "tenor", "bass"] },
  index: { type: "integer", description: "note/syllable: note position in that voice of that measure, 1-based" },
  pitch: { type: "string", description: "note: new pitch like Eb4, F#3 or REST (omit to keep)" },
  dur: { type: "number", description: "note: new length in quarter-note beats (omit to keep)" },
  text: { type: "string", description: "syllable: new syllable text (empty string clears it)" },
  syllabic: { type: "string", enum: ["single", "begin", "middle", "end"] },
  section: { type: "integer", description: "lyricLine: section number as listed (1-based)" },
  line: { type: "integer", description: "lyricLine: line number within the section (1-based)" },
  from: { type: "string", description: "lyricLine: the current line text, exactly" },
  to: { type: "string", description: "lyricLine: the corrected line" },
  toKey: { type: "integer", description: "transpose: target major key as fifths (-6..6; G = 1, F = -1)" },
  direction: { type: "string", enum: ["up", "down", "nearest"] },
  bpm: { type: "integer", description: "tempo: new quarter-note BPM" },
} as const

// Gemini tends to leave out optional fields (an alto fix came back without index or pitch), so every
// field is required there and the ones an edit type doesn't use are null.
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: Object.fromEntries(Object.entries(EDIT_PROPS).map(([k, v]) => [k, k === "type" || k === "summary" ? v : { ...v, nullable: true }])),
        required: Object.keys(EDIT_PROPS),
        propertyOrdering: Object.keys(EDIT_PROPS),
      },
    },
  },
  required: ["reply", "edits"],
  propertyOrdering: ["reply", "edits"],
}
// Claude's structured output wants every object closed; optional fields stay optional.
const CLAUDE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    edits: { type: "array", items: { type: "object", properties: EDIT_PROPS, required: ["type", "summary"], additionalProperties: false } },
  },
  required: ["reply", "edits"],
  additionalProperties: false,
}

export function systemPrompt(uiLang: "es" | "en") {
  return [
    "You are the assistant inside Exalto Hymn Studio, helping a church composer fix a four-part hymn (soprano, alto, tenor, bass) that was read from slides or sheet music by OCR.",
    "Each request comes with the current state of the open hymn: settings, every measure's notes per voice, the soprano syllables, and the lyric sections. Trust that state over earlier messages: the composer may have changed it.",
    "Answer questions about the hymn directly and briefly. When the composer asks for a fix, or you are confident something is wrong, propose concrete edits in `edits`; describe them in `reply` too. You never change anything yourself: the composer previews each edit and accepts or rejects it.",
    "Edit types:",
    "- note: change one note (measure, voice, index, and pitch and/or dur). Pitches are scientific (C4 = middle C) with b/# accidentals, or REST. Keep each voice's beats per measure equal to the time signature.",
    "- syllable: set the soprano syllable under one note (measure, voice soprano, index, text, syllabic). Use this to realign lyrics with notes; propose one edit per note that changes.",
    "- lyricLine: replace one line of a lyric section (section, line, from = the exact current text, to).",
    "- transpose: move the whole hymn to another major key (toKey in fifths, direction up/down/nearest). Use this for \"transpose to G\"; do not list note edits for it.",
    "- tempo: change the quarter-note BPM.",
    "Every edit must carry all the fields its type needs (a note edit always has measure, voice, index and the new pitch or dur). Every change you describe in `reply` must also be in `edits`, or the composer can't apply it.",
    "Use the numbers exactly as listed in the hymn state (measures, notes and sections are 1-based). If the request is unclear, or would need more than about 40 edits, ask or explain instead of guessing.",
    "If something can't be done with these edits (for example adding a measure), say what the composer can do in Studio instead.",
    `Write \`reply\` and each \`summary\` in ${uiLang === "en" ? "English" : "Spanish"}. Keep the reply short; plain text, no Markdown tables.`,
  ].join("\n")
}

function httpError(provider: ChatProvider, status: number, body: string): ChatResult {
  if (status === 401 || status === 403) return { ok: false, provider, code: "badKey" }
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return { ok: false, provider, code: "badKey" }
  if (status === 429) return { ok: false, provider, code: "rateLimit" }
  if (status === 529 || status >= 500) return { ok: false, provider, code: "overloaded" }
  if (status === 413) return { ok: false, provider, code: "tooLong" }
  return { ok: false, provider, code: "failed", detail: `HTTP ${status}` }
}
/** Busy, rate-limited, timed out or model not offered to this key: worth trying the next model. */
const retryable = (status: number) => status === 429 || status === 404 || status === 529 || status >= 500

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  const where = url.replace(/^https:\/\/([^/]+).*?(models\/[^:]+)?(:\w+)?$/, "$1 $2")
  try {
    const res = await net.fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal })
    const text = await res.text()
    trace(`${where} ${(body as { model?: string }).model ?? ""} HTTP ${res.status} after ${Date.now() - t0}ms`)
    return { status: res.status, text }
  } catch (e) {
    trace(`${where} failed after ${Date.now() - t0}ms: ${(e as Error).name}`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** Parse and lightly clean the model's JSON; the renderer checks each edit against the score. */
export function parseAnswer(raw: string): { reply: string; edits: ChatEdit[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "")
  const data = JSON.parse(text) as { reply?: unknown; edits?: unknown }
  if (typeof data?.reply !== "string") throw new SyntaxError("No reply")
  const edits = (Array.isArray(data.edits) ? data.edits : [])
    .filter((e): e is ChatEdit => !!e && typeof e === "object" && typeof (e as ChatEdit).type === "string")
    // Gemini fills unused fields with null: drop them so "not given" reads the same from both providers.
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v != null)) as ChatEdit)
    .slice(0, 80)
  return { reply: data.reply.trim(), edits }
}

function userBlock(context: string, text: string) {
  return `<hymn_state>\n${context}\n</hymn_state>\n\n${text}`
}

async function askGemini(key: string, turns: ChatTurn[], context: string, uiLang: "es" | "en"): Promise<ChatResult> {
  // The hymn state rides with the newest message only, so the model always sees what's on screen now.
  const contents = turns.map((t, i) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: i === turns.length - 1 ? userBlock(context, t.text) : t.text }],
  }))
  let last: ChatResult | null = null
  // When every model fails, report a busy/slow one rather than a later "model not found".
  const busy = (r: ChatResult | null) => !!r && !r.ok && (r.code === "timeout" || r.code === "overloaded" || r.code === "rateLimit")
  const keep = (r: ChatResult) => {
    if (!busy(last) || busy(r)) last = r
  }
  for (const [i, model] of (await geminiModels(key)).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000))
    let reply: { status: number; text: string }
    try {
      reply = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`,
        { "x-goog-api-key": key },
        {
          systemInstruction: { parts: [{ text: systemPrompt(uiLang) }] },
          contents,
          generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA, temperature: 0.2, maxOutputTokens: 16384, thinkingConfig: model.thinking },
        },
      )
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e
      keep({ ok: false, provider: "gemini", code: "timeout" })
      continue
    }
    if (reply.status !== 200) {
      // Google's error message helps diagnose (it never contains the key); keep it short.
      trace(`gemini ${model.id} error: ${reply.text.slice(0, 300).replace(/\s+/g, " ")}`)
      const err = httpError("gemini", reply.status, reply.text)
      if (!retryable(reply.status)) return err
      keep(err)
      continue
    }
    const res = JSON.parse(reply.text) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } }
    const cand = res.candidates?.[0]
    if (res.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") return { ok: false, provider: "gemini", code: "refused" }
    if (cand?.finishReason === "MAX_TOKENS") return { ok: false, provider: "gemini", code: "tooLong" }
    const out = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("")
    return { ok: true, provider: "gemini", model: model.id, ...parseAnswer(out) }
  }
  return last ?? { ok: false, provider: "gemini", code: "overloaded" }
}

async function askClaude(key: string, turns: ChatTurn[], context: string, uiLang: "es" | "en"): Promise<ChatResult> {
  const messages = turns.map((t, i) => ({ role: t.role, content: i === turns.length - 1 ? userBlock(context, t.text) : t.text }))
  let last: ChatResult = { ok: false, provider: "anthropic", code: "overloaded" }
  for (const model of CLAUDE_CHAT_MODELS) {
    let reply: { status: number; text: string }
    try {
      reply = await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": key, "anthropic-version": "2026-10-21" },
        { model, max_tokens: 16000, output_config: { effort: "medium", format: { type: "json_schema", schema: CLAUDE_SCHEMA } }, system: systemPrompt(uiLang), messages },
      )
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e
      last = { ok: false, provider: "anthropic", code: "timeout" }
      continue
    }
    if (reply.status !== 200) {
      last = httpError("anthropic", reply.status, reply.text)
      if (retryable(reply.status)) continue
      return last
    }
    const msg = JSON.parse(reply.text) as { stop_reason?: string; content?: { type: string; text?: string }[] }
    if (msg.stop_reason === "refusal") return { ok: false, provider: "anthropic", code: "refused" }
    if (msg.stop_reason === "max_tokens") return { ok: false, provider: "anthropic", code: "tooLong" }
    const out = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
    return { ok: true, provider: "anthropic", model, ...parseAnswer(out) }
  }
  return last
}

/** Gemini when its key is saved (the assistant's default), else Claude. */
export function pickChatProvider(keys: Partial<Record<ChatProvider, string>>): ChatProvider | null {
  return keys.gemini ? "gemini" : keys.anthropic ? "anthropic" : null
}

export async function hymnChat(keys: Partial<Record<ChatProvider, string>>, rawTurns: unknown, rawContext: unknown, uiLang: unknown): Promise<ChatResult> {
  const provider = pickChatProvider(keys)
  if (!provider) return { ok: false, provider: null, code: "noKey" }
  const turns: ChatTurn[] = (Array.isArray(rawTurns) ? rawTurns : [])
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .map((t) => ({ role: t.role, text: String(t.text).slice(0, 8000) }))
    .slice(-MAX_TURNS)
  // Both APIs want the conversation to start with the user.
  while (turns.length && turns[0].role !== "user") turns.shift()
  if (!turns.length || turns[turns.length - 1].role !== "user") return { ok: false, provider, code: "failed", detail: "No question" }
  const context = String(rawContext ?? "")
  if (context.length > MAX_CONTEXT) return { ok: false, provider, code: "tooLong" }
  const ul = uiLang === "en" ? "en" : "es"
  try {
    return provider === "gemini" ? await askGemini(keys.gemini!, turns, context, ul) : await askClaude(keys.anthropic!, turns, context, ul)
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    if (err instanceof SyntaxError) return { ok: false, provider, code: "badResponse" }
    if (err.name === "AbortError") return { ok: false, provider, code: "timeout" }
    if (err instanceof TypeError || /ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network/i.test(`${err.message} ${err.cause?.code ?? ""}`)) {
      return { ok: false, provider, code: "offline" }
    }
    return { ok: false, provider, code: "failed" }
  }
}
