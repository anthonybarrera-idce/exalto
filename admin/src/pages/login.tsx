import { Loader2 } from "lucide-react"
import { useState } from "react"
import { Navigate } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import { firebaseConfigured, usingEmulators } from "@/lib/firebase"

export function LoginPage() {
  const { user, role, loading, signIn, signOut, refreshRole } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user && role) return <Navigate to="/" replace />

  async function handleSignIn() {
    setError(null)
    setBusy(true)
    try {
      await signIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/exalto-mark.svg" alt="" className="mx-auto mb-2 h-12" />
          <CardTitle className="text-xl">Exalto Admin</CardTitle>
          <CardDescription>Manage hymns, composers and community content.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!firebaseConfigured && !usingEmulators && (
            <Alert>
              <AlertTitle>Firebase isn't configured</AlertTitle>
              <AlertDescription>Copy .env.example to .env.local and fill in the web app config.</AlertDescription>
            </Alert>
          )}
          {user && !role && !loading && (
            <Alert variant="destructive">
              <AlertTitle>No admin access</AlertTitle>
              <AlertDescription>
                {user.email} isn't on the admin team. Ask the owner to give you a role.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {user && !role ? (
            <>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await refreshRole().catch(() => setError("Couldn't check your access. Try again."))
                  setBusy(false)
                }}
              >
                {busy && <Loader2 className="animate-spin" />}
                Check again
              </Button>
              <Button variant="outline" onClick={() => void signOut()}>
                Use a different account
              </Button>
            </>
          ) : (
            <Button onClick={handleSignIn} disabled={busy || loading}>
              {busy && <Loader2 className="animate-spin" />}
              Continue with Google
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
