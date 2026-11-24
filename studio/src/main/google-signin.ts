/**
 * Google sign-in for a desktop app: opens the system browser (Google blocks sign-in inside embedded
 * browsers), receives the redirect on a one-off localhost port, and exchanges the code with PKCE.
 * Returns the Google ID token; the renderer turns it into a Firebase session.
 *
 * Needs a "Desktop app" OAuth client from the same Google Cloud project as Firebase:
 * MAIN_VITE_GOOGLE_CLIENT_ID and MAIN_VITE_GOOGLE_CLIENT_SECRET in studio/.env.local
 * (Google treats a desktop client's secret as non-confidential; it still must not be committed).
 */
import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { shell } from "electron"

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const PAGE = {
  en: { ok: "Signed in. You can close this tab and return to Hymn Studio.", fail: "Sign-in was cancelled or failed. You can close this tab." },
  es: { ok: "Sesión iniciada. Puedes cerrar esta pestaña y volver a Hymn Studio.", fail: "Se canceló el inicio de sesión o falló. Puedes cerrar esta pestaña." },
}

export async function googleSignIn(lang: "es" | "en" = "en"): Promise<string> {
  const clientId = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in isn't set up: add MAIN_VITE_GOOGLE_CLIENT_ID and MAIN_VITE_GOOGLE_CLIENT_SECRET to studio/.env.local")
  }
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash("sha256").update(verifier).digest())
  const state = b64url(randomBytes(16))

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      if (url.pathname !== "/") return void res.writeHead(404).end()
      const ok = url.searchParams.get("state") === state && url.searchParams.get("code")
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(
        `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>Hymn Studio</title><body style="font:16px system-ui;padding:48px;text-align:center">` +
          (ok ? PAGE[lang].ok : PAGE[lang].fail) +
          `</body>`,
      )
      clearTimeout(timer)
      server.close()
      if (ok) resolve({ code: url.searchParams.get("code")!, redirectUri })
      else reject(new Error(url.searchParams.get("error") ?? "Sign-in failed"))
    })
    let redirectUri = ""
    const timer = setTimeout(() => (server.close(), reject(new Error("Sign-in timed out"))), 5 * 60 * 1000)
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        prompt: "select_account",
      }).toString()
      shell.openExternal(auth.toString())
    })
  })

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })
  const body = (await r.json()) as { id_token?: string; error_description?: string; error?: string }
  if (!r.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? "Google didn't return an ID token")
  return body.id_token
}
