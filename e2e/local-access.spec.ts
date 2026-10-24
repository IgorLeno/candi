import { test, expect } from "@playwright/test"
import { resetFakeDispatches } from "./ops-env"

// No login: the panel answers only requests addressed to this machine (localhost, 127.0.0.1, [::1]; any port).
test.describe("Acesso local", () => {
  test.beforeEach(() => {
    resetFakeDispatches()
  })

  test("abre o painel direto, sem login nem botão Sair", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId("today-hero")).toBeVisible()
    await expect(page.getByText("Sair", { exact: true })).toHaveCount(0)

    await page.goto("/vagas")
    await expect(page).toHaveURL(/\/vagas$/)
  })

  test("a página de login não existe mais", async ({ request }) => {
    const response = await request.get("/login", { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })

  test("recusa pedido endereçado a outro nome (rede local ou DNS rebinding)", async ({ request }) => {
    for (const host of ["192.168.31.186:3000", "evil.example:3000", "localhost.evil.example"]) {
      const page = await request.get("/", { headers: { Host: host }, maxRedirects: 0 })
      expect(page.status(), host).toBe(403)
      const api = await request.get("/api/vaga/fake-1001/curriculo", { headers: { Host: host }, maxRedirects: 0 })
      expect(api.status(), host).toBe(403)
    }
    const local = await request.get("/", { headers: { Host: "127.0.0.1:3000" }, maxRedirects: 0 })
    expect(local.status()).toBe(200)
  })
})
