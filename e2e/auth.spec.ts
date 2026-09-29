import { test, expect } from "@playwright/test"
import { E2E_AUTH_ENV, signInAs } from "./auth"

test.describe("Autenticação", () => {
  test("redireciona visitante anônimo para o login", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
    await expect(page.getByTestId("login-google")).toBeVisible()

    await page.goto("/vaga/qualquer")
    await expect(page).toHaveURL(/\/login\?callbackUrl=.*%2Fvaga%2Fqualquer/)
    await expect(page.getByText(/vaga não encontrada/i)).toHaveCount(0)
  })

  test("responde 401 em rotas de API sem sessão", async ({ request }) => {
    const response = await request.get("/api/qualquer", { maxRedirects: 0 })
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" })
  })

  test("recusa sessão de email fora da allowlist", async ({ page, context }) => {
    await signInAs(context, "intruso@e2e.test")
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
  })

  test("recusa cookie assinado com outro segredo", async ({ page, context }) => {
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL, "another-secret-that-the-server-does-not-know-000")
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
  })

  test("mostra erro de acesso negado", async ({ page }) => {
    await page.goto("/login?error=AccessDenied")
    await expect(page.getByTestId("login-error")).toHaveText(/não tem acesso/i)
  })

  test("sessão autorizada entra e sai", async ({ page, context }) => {
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
    await page.goto("/login")
    await expect(page).toHaveURL("/")
    await expect(page.getByTestId("today-hero")).toBeVisible()

    await page.getByTestId("sidebar-sair").click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
  })

  // A request sent with the old cookie whose response lands after "Sair" must not bring
  // the session back. The route handler lets the server answer right away (so it sees a
  // valid session) and only delivers that response to the browser after sign-out.
  test("resposta lenta com o cookie antigo não reativa a sessão após Sair", async ({ page, context }) => {
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
    await page.goto("/")
    await expect(page.getByTestId("today-hero")).toBeVisible()

    let releaseSlow!: () => void
    const released = new Promise<void>((resolve) => (releaseSlow = resolve))
    let serverAnswered!: () => void
    const answered = new Promise<void>((resolve) => (serverAnswered = resolve))

    await page.route("**/configuracoes?slow=1", async (route) => {
      const response = await route.fetch()
      serverAnswered()
      await released
      await route.fulfill({ response })
    })

    // Same shape as a client-side navigation or prefetch: an RSC fetch from the page.
    const slow = page.evaluate(() => fetch("/configuracoes?slow=1", { headers: { RSC: "1" } }).then((r) => r.status))
    await answered

    await page.getByTestId("sidebar-sair").click()
    await expect(page).toHaveURL(/\/login/)

    releaseSlow()
    expect(await slow).toBe(200)

    const cookies = await context.cookies()
    expect(cookies.filter((c) => c.name.startsWith("authjs.session-token"))).toEqual([])
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
  })

  test("proxy só lê a sessão; handlers do Auth.js ainda gravam o cookie", async ({ page, context }) => {
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
    const isSessionCookie = (header: { name: string; value: string }) =>
      header.name.toLowerCase() === "set-cookie" && header.value.startsWith("authjs.session-token")

    const pageResponse = await page.request.get("/")
    expect(pageResponse.status()).toBe(200)
    expect(pageResponse.headersArray().filter(isSessionCookie)).toEqual([])

    // Sign-in and sign-out write the cookie from Auth.js' own handlers, like this one.
    const sessionResponse = await page.request.get("/api/auth/session")
    expect(await sessionResponse.json()).toMatchObject({ user: { email: E2E_AUTH_ENV.ALLOWED_EMAIL } })
    expect(sessionResponse.headersArray().filter(isSessionCookie)).toHaveLength(1)
  })
})
