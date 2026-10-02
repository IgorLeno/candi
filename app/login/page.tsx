import { redirect } from "next/navigation"
import { Crosshair } from "lucide-react"
import { signInWithGoogle } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAllowedSession } from "@/lib/auth/session"

// Auth.js error codes shown on this page (`pages.error` points here).
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Esta conta Google não tem acesso ao dashboard.",
  Configuration: "Login indisponível: configuração de autenticação incompleta no servidor.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>
}) {
  if (await getAllowedSession()) redirect("/")

  const params = await searchParams
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/"
  const error = typeof params.error === "string" ? params.error : undefined
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Não foi possível entrar. Tente novamente.") : undefined

  return (
    <main className="mesh-bg min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm rounded-3xl">
        <CardHeader className="items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-st-open flex items-center justify-center mb-2">
            <Crosshair className="w-6 h-6 text-st-open-ink" aria-hidden="true" />
          </div>
          <CardTitle className="font-display text-2xl font-bold">Caçavaga</CardTitle>
          <CardDescription>Acesso restrito. Entre com a conta Google autorizada.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage && (
            <p role="alert" data-testid="login-error" className="text-sm text-destructive text-center">
              {errorMessage}
            </p>
          )}
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" className="w-full" data-testid="login-google">
              Entrar com Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
