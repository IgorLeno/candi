import { test, expect, type Page } from "@playwright/test"
import { E2E_AUTH_ENV, signInAs } from "./auth"

// Runs against the deterministic job-search fixture (JOB_SEARCH_DATA_SOURCE=fixture), never the real Sheet.
test.describe("Painel do job-search", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
  })

  async function pickFilter(page: Page, facet: string, option: string) {
    await page.getByTestId(`filter-${facet}`).click()
    await page.getByRole("option", { name: option, exact: true }).click()
  }

  test("hoje: fila, próxima jogada e meta", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("today-hero")).toContainText("4 vagas abertas esperando você")
    await expect(page.getByTestId("data-source")).toContainText("Fixture local")
    // Queue order: interest, then progress, then most recent analysis.
    await expect(page.getByTestId("next-move")).toHaveAttribute("data-job-id", "fake-1001")
    await expect(page.getByTestId("queue-list").getByTestId("job-row")).toHaveCount(3)
    await expect(page.getByTestId("sent-list").getByTestId("job-row")).toHaveAttribute("data-job-id", "fake-1006")
    await expect(page.getByTestId("goal-ring")).toHaveAttribute("data-goal", "5")

    await page.getByTestId("sidebar-configuracoes").click()
    await page.getByTestId("weekly-goal-input").fill("8")
    await page.getByTestId("weekly-goal-save").click()
    await page.getByTestId("sidebar-hoje").click()
    await expect(page.getByTestId("goal-ring")).toHaveAttribute("data-goal", "8")

    await page.getByTestId("next-move-link").click()
    await expect(page).toHaveURL("/vaga/fake-1001")
  })

  test("análise → lista → vaga", async ({ page }) => {
    await page.goto("/analise")
    await expect(page.getByRole("heading", { name: "Análise" })).toBeVisible()
    await expect(page.getByTestId("kpi-analisadas")).toContainText("9")
    await expect(page.getByTestId("kpi-enviadas")).toContainText("1")
    await expect(page.getByTestId("funnel")).toBeVisible()

    await page.getByTestId("sidebar-vagas").click()
    await expect(page).toHaveURL("/vagas")
    await expect(page.getByTestId("result-count")).toHaveText("9 de 9 vagas")

    await page.locator('[data-job-id="fake-1001"]').getByTestId("job-link").click()
    await expect(page).toHaveURL("/vaga/fake-1001")
    await expect(page.getByTestId("job-empresa")).toHaveText("Mineradora Exemplo")
    await expect(page.getByTestId("analysis-banner")).toHaveAttribute("data-analysis", "FULL")
    await expect(page.getByTestId("req-ADERÊNCIA REAL")).toContainText("graduação em Engenharia Química")
    await expect(page.getByTestId("req-LACUNA")).toContainText("conhecimento em SAP")
    await expect(page.getByTestId("interest-level")).toContainText("muito alto")
    await expect(page.getByTestId("location")).toContainText("Belo Horizonte/MG")
    await expect(page.getByTestId("events-timeline")).toContainText("Tentativa iniciada")

    await page.getByTestId("back-to-list").click()
    await expect(page).toHaveURL("/vagas")
  })

  test("KPI e distribuições abrem a lista filtrada", async ({ page }) => {
    await page.goto("/analise")
    await page.getByTestId("kpi-prontasRevisao").click()
    await expect(page).toHaveURL(/status_candidatura=PRONTA/)
    await expect(page.getByTestId("result-count")).toHaveText("1 de 9 vagas")

    await page.goto("/analise")
    await page
      .getByTestId("dist-interesse")
      .getByRole("link", { name: /Muito alto/ })
      .click()
    await expect(page).toHaveURL(/interesse=MUITO_ALTO/)
    await expect(page.getByTestId("job-row")).toHaveCount(3)
  })

  test("filtros e busca da lista", async ({ page }) => {
    await page.goto("/vagas")
    // Cards by default; the table view shows the same rows.
    await expect(page.getByTestId("job-row").first()).toHaveAttribute("data-state", /.+/)
    await page.getByTestId("view-table").click()
    await expect(page.getByTestId("view-table")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("job-row")).toHaveCount(9)

    await pickFilter(page, "analysis", "Dossier inválido")
    await expect(page.getByTestId("job-row")).toHaveCount(1)
    await expect(page).toHaveURL(/analysis=INVALID/)

    await page.getByTestId("clear-filters").click()
    await expect(page.getByTestId("result-count")).toHaveText("9 de 9 vagas")

    await pickFilter(page, "interesse", "Alto")
    await expect(page.getByTestId("job-row")).toHaveCount(2)

    await page.getByTestId("search-input").fill("quimica exemplo")
    await expect(page.getByTestId("job-row")).toHaveCount(1)
    await expect(page.getByTestId("job-row")).toHaveAttribute("data-job-id", "fake-1006")

    // Filters survive a reload because they live in the URL.
    await page.reload()
    await expect(page.getByTestId("job-row")).toHaveCount(1)

    await page.getByTestId("search-input").fill("nada-assim")
    await expect(page.getByTestId("empty-list")).toHaveText(/nenhuma vaga corresponde/i)
  })

  test("alerta de ENVIO INCERTO", async ({ page }) => {
    await page.goto("/")
    const alert = page.getByTestId("alert-envio-incerto")
    await expect(alert).toContainText("ENVIO INCERTO em 1 vaga")
    await alert.getByRole("link", { name: /Energia Exemplo/ }).click()

    await expect(page).toHaveURL("/vaga/fake-1007")
    await expect(page.getByTestId("job-alert-envio-incerto")).toBeVisible()
    await expect(page.getByTestId("events-timeline")).toContainText("sem resultado registrado")

    await page.goto("/vagas")
    await page.getByTestId("toggle-envio-incerto").click()
    await expect(page.getByTestId("job-row")).toHaveCount(1)
    await expect(page.getByTestId("job-row")).toHaveAttribute("data-job-id", "fake-1007")
  })

  test("dossier inválido não expõe conteúdo", async ({ page }) => {
    await page.goto("/vaga/fake-1004")
    const banner = page.getByTestId("analysis-banner")
    await expect(banner).toHaveAttribute("data-analysis", "INVALID")
    await banner.getByText("Por que é inválido").click()
    await expect(page.getByTestId("dossier-errors")).toContainText("dossier_sha256")
    await expect(page.getByText(/não passou na verificação/)).toBeVisible()
    await expect(page.getByTestId("posting")).toHaveCount(0)
    await expect(page.getByTestId("req-ADERÊNCIA REAL")).toHaveCount(0)
  })

  test("enum inválido aparece como problema de dados", async ({ page }) => {
    await page.goto("/analise")
    await expect(page.getByTestId("dist-status_candidatura")).toContainText("Inválido")
    await expect(page.getByTestId("issue-ENUM_INVALID")).toContainText("1")

    await page.goto("/vaga/fake-1005")
    await expect(page.getByTestId("badge-candidatura")).toHaveText(/Inválido: NãO INICIADA/)
    await expect(page.getByTestId("job-issues")).toContainText("status_candidatura")
    await expect(page.getByTestId("analysis-banner")).toHaveAttribute("data-analysis", "NONE")
  })

  test("vaga sem dossier continua navegável", async ({ page }) => {
    await page.goto("/vaga/fake-1006")
    await expect(page.getByTestId("job-empresa")).toHaveText("Química Exemplo")
    await expect(page.getByTestId("analysis-banner")).toHaveAttribute("data-analysis", "PARTIAL")
    await expect(page.getByText(/não tem dossier/)).toBeVisible()
    await expect(page.getByTestId("events-timeline")).toContainText("Enviada")
  })

  test("vaga inexistente e configurações", async ({ page }) => {
    await page.goto("/vaga/inexistente")
    await expect(page.getByTestId("job-not-found")).toContainText("Vaga não encontrada")

    await page.getByTestId("sidebar-configuracoes").click()
    await expect(page).toHaveURL("/configuracoes")
    await expect(page.getByText("Aparência", { exact: true })).toBeVisible()
  })
})
