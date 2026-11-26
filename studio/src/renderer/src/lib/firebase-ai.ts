/**
 * Firebase AI Logic (the `firebase/ai` part of the Firebase SDK Studio already uses): calls Gemini
 * through the Exalto Firebase project, so no Gemini API key is needed on this computer. Requests
 * go via Firebase's proxy with the project's Gemini Developer API set up in the Firebase console
 * (AI Logic → Get started). Not wired into the assistant yet: the assistant still uses the key from
 * Settings in the main process (src/main/ai-chat.ts).
 */
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai"
import { app } from "@/lib/firebase"

export const firebaseAI = getAI(app, { backend: new GoogleAIBackend() })

/** Newest Flash first; Google often answers 503 "high demand" for the newest, an older one is usually free. */
export const FIREBASE_AI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"]

export const firebaseModel = (model = FIREBASE_AI_MODELS[0]) => getGenerativeModel(firebaseAI, { model })

/** One prompt, trying each model in turn while they're busy. Returns the text and the model that answered. */
export async function firebaseGenerate(prompt: string): Promise<{ model: string; text: string }> {
  let last: unknown
  for (const model of FIREBASE_AI_MODELS) {
    try {
      const r = await firebaseModel(model).generateContent(prompt)
      return { model, text: r.response.text() }
    } catch (e) {
      last = e
      // Busy, rate-limited or not offered to this project: try the next one. Anything else is final.
      if (!/\b(503|429|404)\b|overloaded|high demand|not found/i.test(String(e))) throw e
    }
  }
  throw last
}
