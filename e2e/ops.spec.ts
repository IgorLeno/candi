import { test, expect } from "@playwright/test"
import { mkdirSync, writeFileSync } from "fs"
import { E2E_AUTH_ENV, signInAs } from "./auth"
import { E2E_FAKE_DISPATCH_STATE, resetFakeDispatches } from "./ops-env"

function useLocalCvRenderer() {
  mkdirSync(E2E_FAKE_DISPATCH_STATE, { recursive: true })
  writeFileSync(`${E2E_FAKE_DISPATCH_STATE}/cv-renderer`, "local\n")
}

// Bot dispatch against the fake job-search dispatcher (e2e/fixtures/job-search-fake): no bot, no gateway.
test.describe("Central de operações (bots)", () => {
  test.beforeEach(async ({ context, page }) => {
    resetFakeDispatches()
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
    // Platform preference is per browser; start every test on Hermes (once per tab, so reloads keep choices).
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("e2e-platform-init")) return
      window.sessionStorage.setItem("e2e-platform-init", "1")
      window.localStorage.setItem("estagios:plataforma-bots", "hermes")
    })
  })

  test("cotar vagas: página própria, fora de Hoje e Vagas; card que precisa de você fica à mostra", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("today-hero")).toBeVisible()
    await expect(page.getByTestId("search-ops")).toHaveCount(0)
    await page.getByTestId("sidebar-vagas").click()
    await expect(page.getByTestId("search-input")).toBeVisible()
    await expect(page.getByTestId("search-ops")).toHaveCount(0)

    await page.getByTestId("sidebar-cotar").click()
    await expect(page).toHaveURL("/cotar")
    await expect(page.getByTestId("sidebar-cotar")).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("heading", { name: "Cotar vagas", level: 1 })).toBeVisible()
    const ops = page.getByTestId("search-ops")
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toHaveText("Cotar vagas")
    await expect(ops.getByTestId("intake-button")).toHaveText("Buscar vaga específica")
    // Nothing dispatched yet: no card and no toggle.
    await expect(ops.getByTestId("toggle-search")).toHaveCount(0)
    await expect(ops.getByTestId("toggle-intake")).toHaveCount(0)
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)

    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await expect(page.getByTestId("dispatch-dialog")).toContainText("Cotação de vagas")
    await page.getByTestId("dispatch-confirm").click()
    // Running: the card shows without the toggle, which stays pressed and disabled, also after a reload.
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toBeVisible()
    await page.reload()
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toBeVisible()
    const toggle = ops.getByTestId("toggle-search")
    await expect(toggle).toBeDisabled()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(toggle).toHaveAttribute("data-forced", "true")
  })

  test("cotar vagas: confirmação, progresso por etapa e registro na planilha pelo job-search", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/cotar")
    const ops = page.getByTestId("search-ops")
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)

    // Cancel never dispatches.
    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await expect(page.getByTestId("dispatch-dialog")).toContainText("ChatGPT")
    await page.getByTestId("dispatch-cancel").click()
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)

    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await page.getByTestId("dispatch-confirm").click()
    const card = ops.getByTestId("dispatch-BUSCAR_VAGAS")
    await expect(card).toBeVisible()
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toBeDisabled()

    // The fake finishes the bots' part. The writeset has fake-1001 (already in the fixture Sheet) and fake-9001
    // (not yet), so the registration stage stays open until the writeset is persisted.
    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    const registro = card.locator('[data-stage="registro"]')
    await expect(registro).toHaveAttribute("data-state", "active")
    await expect(registro).toContainText("pendente de persistência · 1 de 2 na planilha")
    await expect(card).toContainText("76%")
    const registration = card.getByTestId("writeset-registration")
    await expect(registration).toHaveAttribute("data-registration", "none")

    // Confirmation says who writes and how many jobs; cancel asks nothing.
    await registration.getByTestId("register-writeset").click()
    const dialog = page.getByTestId("register-dialog")
    await expect(dialog).toContainText("2 vagas")
    await expect(dialog).toContainText("credencial de escrita")
    await expect(dialog).toContainText("writeset.py check VALID")
    await page.getByTestId("register-cancel").click()
    await expect(registration).toHaveAttribute("data-registration", "none")

    await registration.getByTestId("register-writeset").click()
    await page.getByTestId("register-confirm").click()
    await expect(registration.getByTestId("register-writeset")).toHaveCount(0)
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(registro).toHaveAttribute("data-state", "done")
    await expect(registro).toContainText("gravado pelo job-search")
    await expect(card).toContainText("100%")
    await expect(registration).toContainText("gravado pelo job-search (1 novas, 0 atualizadas, 1 sem mudança)")
    // The panel reads the Sheet again once the persistence it watched finished.
    await expect(page.getByText("planilha relida")).toBeVisible()

    // Registered and done: after a reload the card waits behind "Última cotação".
    await page.reload()
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toHaveText("Nova cotação")
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)
    const toggle = ops.getByTestId("toggle-search")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveAttribute("data-status", "CONCLUIDO")
    await toggle.click()
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)
  })

  test("cotar vagas: as que ficaram de fora aparecem com o motivo e vão ao ChatGPT só a pedido", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(120_000)
    await page.goto("/cotar")
    const ops = page.getByTestId("search-ops")
    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await page.getByTestId("dispatch-confirm").click()
    const card = ops.getByTestId("dispatch-BUSCAR_VAGAS")
    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })

    // Collapsed by default; the verdict is shown, never a gate.
    const leftOut = card.getByTestId("left-out")
    await expect(leftOut.getByTestId("left-out-toggle")).toHaveText("Ficaram de fora · 4")
    await expect(leftOut.getByTestId("left-out-job")).toHaveCount(0)
    await leftOut.getByTestId("left-out-toggle").click()
    await expect(leftOut.getByTestId("left-out-job")).toHaveCount(4)
    const job = (id: string) => leftOut.locator(`[data-testid="left-out-job"][data-job-id="${id}"]`)
    await expect(job("fake-9101").getByTestId("left-out-reason")).toContainText("Pré-filtro")
    await expect(job("fake-9101").getByTestId("left-out-reason")).toContainText("estágio/aprendiz")
    await expect(job("fake-9103").getByTestId("left-out-reason")).toContainText("Acima do limite da rodada")
    await expect(job("fake-9101").getByTestId("left-out-send")).toBeEnabled()
    await expect(job("fake-9103").getByTestId("left-out-send")).toBeEnabled()
    // Only technical reasons disable: analysed some other way, or an older search without the card.
    await expect(job("fake-1001").getByTestId("left-out-send")).toBeDisabled()
    await expect(job("fake-1001").getByTestId("left-out-blocker")).toContainText("Já está no job-search")
    await expect(job("fake-9104").getByTestId("left-out-send")).toBeDisabled()
    await expect(job("fake-9104").getByTestId("left-out-blocker")).toContainText("Cotação antiga")

    await job("fake-9101").getByTestId("left-out-send").click()
    const analysis = job("fake-9101").getByTestId("dispatch-ANALISAR_DESCOBERTA")
    await expect(analysis).toBeVisible()
    await expect(analysis).toContainText("ChatGPT (host) · Hermes")
    await expect(job("fake-9101").getByTestId("left-out-send")).toBeDisabled()
    // One ChatGPT pipeline at a time: a new search waits.
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toBeDisabled()
    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    for (const stage of ["posting", "analise", "writeset"]) {
      await expect(analysis.locator(`[data-stage="${stage}"]`)).toHaveAttribute("data-state", "done")
    }
    await expect(analysis.getByTestId("analysis-diagnosis")).toContainText("DESCARTADA")
    // Registering is the user's choice, with the existing flow; nothing went to the Sheet.
    const registration = analysis.getByTestId("writeset-registration")
    await expect(registration).toHaveAttribute("data-registration", "none")
    await registration.getByTestId("register-writeset").click()
    await page.getByTestId("register-confirm").click()
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(job("fake-9101").getByTestId("left-out-send")).toHaveText("Mandar de novo")
  })

  test("vaga específica: localizar, mandar para o ChatGPT e registrar na planilha", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/cotar")
    const ops = page.getByTestId("search-ops")
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)

    // The same guards as the dispatcher explain a refusal before anything is sent; cancel sends nothing.
    await ops.getByTestId("intake-button").click()
    const dialog = page.getByTestId("intake-dialog")
    await expect(dialog).toContainText("não comando")
    await expect(dialog).toContainText("Roda sempre pelo Hermes")
    await expect(dialog.getByTestId("platform-toggle")).toHaveCount(0)
    const input = page.getByTestId("intake-input")
    await input.fill("curto")
    await expect(page.getByTestId("intake-confirm")).toBeDisabled()
    await input.fill("Estágio na Empresa Indicada, ok 1a2b3c4d")
    await expect(page.getByTestId("intake-problem")).toContainText("aprovação")
    await expect(page.getByTestId("intake-confirm")).toBeDisabled()
    await page.getByTestId("intake-cancel").click()
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)

    const text = "Estágio em processos químicos na Empresa Indicada, Camaçari.\nLink: https://exemplo.com/vagas/9002"
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill(text)
    await expect(page.getByTestId("intake-count")).toHaveText(`${text.length}/1500`)
    await page.getByTestId("intake-confirm").click()
    const intake = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(intake).toBeVisible()
    await expect(intake.getByTestId("intake-text")).toHaveText(text)
    // Search and intake share the Lince: one at a time.
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toBeDisabled()
    await expect(ops.getByTestId("intake-button")).toBeDisabled()

    await expect(intake).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(intake.getByTestId("intake-job")).toContainText("Estágio em Processos Químicos · Empresa Indicada")
    await expect(intake.getByTestId("intake-link")).toHaveAttribute("href", "https://exemplo.com/vagas/9002")
    await expect(intake.getByTestId("intake-link")).toHaveAttribute("rel", /noopener/)
    await expect(intake.getByTestId("intake-prefilter")).toHaveAttribute("data-verdict", "BLOQUEIO_GRAVE")
    await expect(intake.getByTestId("intake-prefilter")).toContainText("pede formatura até 12/2026")

    // BLOQUEIO_GRAVE does not block the ChatGPT step: the dialog only warns.
    await intake.getByTestId("intake-analyze").click()
    const decision = page.getByTestId("intake-decision-dialog")
    await expect(decision).toContainText("bloqueio grave")
    await page.getByTestId("intake-decision-confirm").click()
    const analysis = ops.getByTestId("dispatch-ANALISAR_INDICADA")
    await expect(analysis).toBeVisible()
    await expect(intake.getByTestId("intake-analyze")).toHaveCount(0)
    await expect(intake.getByTestId("intake-discard")).toHaveCount(0)

    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("SELECIONADA")
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("interesse ALTO")
    // Host pipeline: ChatGPT straight from job-search; the reason is shown as plain text (no HTML).
    await expect(analysis).toContainText("ChatGPT (host) · Hermes")
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("Diagnóstico do ChatGPT")
    await expect(analysis.getByTestId("diagnosis-reason")).toHaveText(
      "Gate 4 aprovado: <b>núcleo</b> de processos químicos com evidência direta"
    )
    await expect(analysis.getByTestId("diagnosis-reason").locator("b")).toHaveCount(0)
    await expect(analysis.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "active")
    await expect(analysis.getByTestId("intake-discard")).toBeVisible()

    const registration = analysis.getByTestId("writeset-registration")
    await registration.getByTestId("register-writeset").click()
    await expect(page.getByTestId("register-dialog")).toContainText("1 vaga")
    await page.getByTestId("register-confirm").click()
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(analysis.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "done")
    // Recorded in the Sheet: no discard any more.
    await expect(analysis.getByTestId("intake-discard")).toHaveCount(0)

    // Registered: after a reload the pair waits behind "Última vaga buscada".
    await page.reload()
    await expect(ops.getByTestId("intake-button")).toBeEnabled()
    await expect(ops.getByTestId("dispatch-ANALISAR_INDICADA")).toHaveCount(0)
    await ops.getByTestId("toggle-intake").click()
    await expect(ops.getByTestId("dispatch-ANALISAR_INDICADA")).toHaveAttribute("data-status", "CONCLUIDO")
  })

  test("vaga específica: recolher, fechar e reabrir os cards, lembrado após recarregar", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/cotar")
    const ops = page.getByTestId("search-ops")
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio em processos químicos na Empresa Indicada, Camaçari.")
    await page.getByTestId("intake-confirm").click()
    const intake = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(intake).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await intake.getByTestId("intake-analyze").click()
    await page.getByTestId("intake-decision-confirm").click()
    const analysis = ops.getByTestId("dispatch-ANALISAR_INDICADA")
    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })

    // Cards start open; the toggle names the card and points at its details.
    for (const card of [intake, analysis]) {
      const toggle = card.getByTestId("dispatch-collapse")
      await expect(toggle).toHaveAttribute("aria-expanded", "true")
      const details = card.getByTestId("dispatch-details")
      await expect(toggle).toHaveAttribute("aria-controls", (await details.getAttribute("id")) ?? "missing")
      await expect(details).toBeVisible()
    }
    await expect(intake.getByTestId("dispatch-collapse")).toHaveAccessibleName("Detalhes: Vaga específica")

    // Collapsing hides the details only: title, status and progress stay; nothing goes to the dispatcher.
    await intake.getByTestId("dispatch-collapse").click()
    await analysis.getByTestId("dispatch-collapse").click()
    for (const card of [intake, analysis]) {
      await expect(card.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "false")
      await expect(card.getByTestId("dispatch-details")).toBeHidden()
      await expect(card.getByTestId("dispatch-status")).toHaveText("Concluído")
      await expect(card.getByTestId("dispatch-progress")).toBeVisible()
    }
    await expect(intake.getByTestId("intake-job")).toBeHidden()
    await expect(analysis.getByTestId("intake-diagnosis")).toBeHidden()

    // The choice is remembered per card after a reload.
    await page.reload()
    await expect(intake.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "false")
    await expect(analysis.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "false")
    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO")
    await expect(analysis.getByTestId("writeset-registration")).toBeHidden()

    // Reopening brings the details (and the pending "Registrar na planilha") back.
    await analysis.getByTestId("dispatch-collapse").click()
    await expect(analysis.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "true")
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("SELECIONADA")
    await expect(analysis.getByTestId("register-writeset")).toBeVisible()
    await expect(intake.getByTestId("intake-job")).toBeHidden()
    await intake.getByTestId("dispatch-collapse").click()
    await expect(intake.getByTestId("intake-job")).toContainText("Estágio em Processos Químicos · Empresa Indicada")
    await page.reload()
    await expect(intake.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "true")
    await expect(analysis.getByTestId("dispatch-collapse")).toHaveAttribute("aria-expanded", "true")

    // "Fechar" takes both cards off the panel (view only); it stays closed after a reload and can come back.
    await expect(analysis.getByTestId("dispatch-close")).toHaveAccessibleName("Fechar: Análise da vaga específica")
    await analysis.getByTestId("dispatch-close").click()
    await expect(intake).toHaveCount(0)
    await expect(analysis).toHaveCount(0)
    await page.reload()
    await expect(ops.getByTestId("intake-reopen")).toBeVisible()
    await expect(intake).toHaveCount(0)
    await expect(analysis).toHaveCount(0)
    await ops.getByTestId("intake-reopen").click()
    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO")
    await expect(analysis.getByTestId("register-writeset")).toBeVisible()
    await intake.getByTestId("dispatch-close").click()
    await expect(intake).toHaveCount(0)
    await expect(ops.getByTestId("intake-reopen")).toBeVisible()
  })

  test('vaga específica: não localizada oferece candidatas ou "Outro"; descartar e excluir só no painel', async ({
    page,
  }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(210_000)
    await page.goto("/cotar")
    const ops = page.getByTestId("search-ops")
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio na nao-existe S.A., cargo que ninguém anunciou")
    await page.getByTestId("intake-confirm").click()
    const missing = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(missing).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await expect(missing.getByTestId("intake-reason")).toContainText("nenhuma vaga com essa descrição")
    await expect(missing.locator('[data-stage="localizar"]')).toHaveAttribute("data-state", "failed")
    await expect(missing).toContainText("NEEDS_CONTEXT")
    await expect(missing).toContainText("escolha a vaga acima")
    await expect(missing.getByTestId("intake-analyze")).toHaveCount(0)

    // The Lince's candidates plus "Outro" (always last); an unsafe link is not rendered.
    const refine = missing.getByTestId("intake-refine")
    await expect(refine.getByTestId("intake-candidate")).toHaveCount(2)
    await expect(refine.getByTestId("intake-candidate").first()).toContainText("Engenheiro Químico · Empresa Indicada")
    await expect(refine.getByTestId("intake-candidate-link")).toHaveCount(1)
    await expect(refine.getByTestId("intake-candidate-link")).toHaveAttribute("href", "https://exemplo.com/vagas/9101")
    await expect(refine.getByTestId("intake-refine-submit")).toBeDisabled()
    await refine.getByTestId("intake-candidate-other").click()
    const complement = refine.getByTestId("intake-refine-input")
    await complement.fill("é essa, ok 1a2b3c4d")
    await expect(refine.getByTestId("intake-refine-problem")).toContainText("aprovação")
    await expect(refine.getByTestId("intake-refine-submit")).toBeDisabled()
    const original = "Estágio na nao-existe S.A., cargo que ninguém anunciou"
    const room = 1500 - original.length - "\n\nComplemento:\n".length
    await complement.fill("a vaga é de engenheiro químico")
    await expect(refine.getByTestId("intake-refine-count")).toHaveText(`30/${room}`)
    await refine.getByTestId("intake-refine-submit").click()

    // One card: the new intake carries the original text plus the complement and is located.
    const refined = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(refined.getByTestId("intake-refines")).toBeVisible()
    await expect(refined.getByTestId("intake-text")).toContainText("Complemento:")
    await expect(refined.getByTestId("intake-text")).toContainText("a vaga é de engenheiro químico")
    await expect(refined).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(refined.getByTestId("intake-refine")).toHaveCount(0)
    await expect(refined.getByTestId("intake-job")).toBeVisible()
    await refined.getByTestId("intake-discard").click()
    await page.getByTestId("intake-decision-confirm").click()
    // Discarded: out of the active area (the complemented original does not come back), into the collapsed list.
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)
    const shelf = ops.getByTestId("intake-discarded-list")
    await expect(shelf).toContainText("Vagas específicas descartadas · 1")

    // A located job may be discarded before the ChatGPT step: nothing goes to the Sheet.
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio em processos químicos na Empresa Indicada, Camaçari")
    await page.getByTestId("intake-confirm").click()
    const located = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(located).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(located.getByTestId("intake-job")).toBeVisible()
    await located.getByTestId("intake-discard").click()
    await expect(page.getByTestId("intake-decision-dialog")).toContainText("Nada vai para a planilha")
    await page.getByTestId("intake-decision-cancel").click()
    await expect(located.getByTestId("dispatch-discarded")).toHaveCount(0)
    await located.getByTestId("intake-discard").click()
    await page.getByTestId("intake-decision-confirm").click()
    await expect(page.getByText("Nada foi para a planilha").first()).toBeVisible()
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)
    await expect(shelf).toContainText("Vagas específicas descartadas · 2")
    await shelf.locator("summary").click()
    const items = shelf.getByTestId("intake-discarded-item")
    await expect(items.first()).toContainText("Estágio em Processos Químicos · Empresa Indicada")

    // "Excluir" from the list: gone from the panel for good (the complemented original goes with it).
    await items.nth(1).getByTestId("intake-delete").click()
    await expect(page.getByTestId("intake-delete-dialog")).toContainText("Nada vai para a planilha")
    await page.getByTestId("intake-delete-cancel").click()
    await expect(items).toHaveCount(2)
    await items.nth(1).getByTestId("intake-delete").click()
    await page.getByTestId("intake-delete-confirm").click()
    await expect(shelf).toContainText("Vagas específicas descartadas · 1")
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)

    // "Excluir" straight from the active card skips the discarded list.
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio em processos químicos na Empresa Indicada, de novo")
    await page.getByTestId("intake-confirm").click()
    const again = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(again).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await again.getByTestId("intake-delete").click()
    await page.getByTestId("intake-delete-confirm").click()
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)
    await expect(shelf).toContainText("Vagas específicas descartadas · 1")
  })

  test("vaga: gerar currículo antes, depois preencher candidatura", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/vaga/fake-1001")
    const ops = page.getByTestId("job-detail")
    // Three sections, in order, each with its own bot action (decision 2026-10-03).
    await expect(page.locator('[data-testid^="job-section-"]')).toHaveCount(3)
    const sections = await page.locator('[data-testid^="job-section-"] h2').allTextContents()
    expect(sections).toEqual(["Análise da vaga", "Currículo", "Candidatura"])
    await expect(page.getByTestId("job-section-analise").getByTestId("analyze-button")).toBeVisible()
    await expect(page.getByTestId("job-section-curriculo").getByTestId("dispatch-button-GERAR_CURRICULO")).toBeVisible()
    await expect(
      page.getByTestId("job-section-candidatura").getByTestId("dispatch-button-PREENCHER_CANDIDATURA")
    ).toBeVisible()
    await expect(ops.getByTestId("cv-status")).toHaveText("Currículo não gerado")
    await expect(page.getByTestId("cv-preview-empty")).toHaveText("Ainda não há currículo gerado para esta vaga.")

    // Without a ready CV the application dialog recommends generating it first.
    await ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA").click()
    await expect(page.getByTestId("dispatch-dialog")).toContainText("ainda não está pronto")
    await expect(page.getByTestId("dispatch-dialog")).toContainText("Nenhuma candidatura é enviada")
    await page.getByTestId("dispatch-cancel").click()

    await ops.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    const cv = ops.getByTestId("dispatch-GERAR_CURRICULO")
    await expect(cv).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    // The finished run refreshes the preview without a reload: the PDF job-search registered, served inline.
    const preview = page.getByTestId("job-section-curriculo").getByTestId("cv-preview")
    await expect(preview.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake.pdf")
    const src = await preview.getByTestId("cv-preview-frame").getAttribute("src")
    expect(src).toMatch(/^\/api\/vaga\/fake-1001\/curriculo\?v=[0-9a-f]{12}$/)
    const pdf = await page.request.get(src!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()["content-type"]).toBe("application/pdf")
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-")
    await page.reload()
    await expect(page.getByTestId("job-detail").getByTestId("cv-status")).toHaveText("Currículo pronto")

    await page.getByTestId("job-detail").getByTestId("dispatch-button-PREENCHER_CANDIDATURA").click()
    await expect(page.getByTestId("dispatch-dialog")).not.toContainText("ainda não está pronto")
    await page.getByTestId("dispatch-confirm").click()
    const application = page.getByTestId("job-detail").getByTestId("dispatch-PREENCHER_CANDIDATURA")
    await expect(application).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(application.locator('[data-stage="aprovacao"]')).toHaveAttribute("data-state", "done")
  })

  test("currículo local: segunda avaliação exige aprovação individual antes do PDF", async ({ page }) => {
    test.setTimeout(120_000)
    useLocalCvRenderer()
    await page.goto("/vaga/fake-1001")
    const section = page.getByTestId("job-section-curriculo")
    await expect(section.getByTestId("cv-local-edit")).toBeVisible()
    await expect(section.getByTestId("cv-edit")).toHaveCount(0)
    await expect(section.getByTestId("platform-toggle")).toHaveCount(0)
    await section.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(section.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })
    await section.getByTestId("cv-reassess-submit").click()
    const edit = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(edit).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    const proposal = edit.getByTestId("cv-proposal")
    await expect(proposal.getByTestId("cv-change-1")).toContainText("Resumo profissional")
    await expect(proposal.getByTestId("cv-change-3")).toContainText("Corte apenas se faltar espaço")
    await proposal.getByTestId("cv-reject-1").click()
    await expect(proposal.getByTestId("cv-approve-2")).toBeDisabled()
    await proposal.getByTestId("cv-approve-1").click()
    await proposal.getByTestId("cv-reject-2").click()
    await proposal.getByTestId("cv-reject-3").click()
    await proposal.getByTestId("cv-apply-changes").click()
    await expect(edit).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake-v2.pdf")
  })

  test("currículo local: comentários e edição manual geram PDF; rejeição preserva o arquivo", async ({ page }) => {
    test.setTimeout(150_000)
    useLocalCvRenderer()
    await page.goto("/vaga/fake-1001")
    const section = page.getByTestId("job-section-curriculo")
    await section.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(section.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })
    const form = section.getByTestId("cv-local-edit")
    await form.getByTestId("cv-mode-request").click()
    await form.getByTestId("cv-local-request").fill("Deixe o resumo mais direto para esta vaga.")
    await form.getByTestId("cv-local-request-submit").click()
    const edit = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(edit).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await edit.getByTestId("cv-reject-all").click()
    await expect(edit.getByTestId("cv-all-rejected")).toBeVisible()
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake.pdf")

    await form.getByTestId("cv-mode-manual").click()
    const manual = form.getByTestId("cv-manual-editor")
    await expect(manual.getByText("contato protegido")).toBeVisible()
    await expect(manual.getByTestId("cv-manual-submit")).toBeDisabled()
    await manual.getByTestId("cv-manual-summary/text").fill("Resumo escrito manualmente para esta vaga.")
    await expect(manual.getByTestId("cv-manual-submit")).toBeEnabled()
    await manual.getByTestId("cv-manual-submit").click()
    await expect(section.getByTestId("dispatch-EDITAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake-v2.pdf")
  })

  test("currículo local: sem mudanças preserva o PDF e renderer inválido bloqueia novas ações", async ({ page }) => {
    test.setTimeout(90_000)
    useLocalCvRenderer()
    await page.goto("/vaga/fake-1004")
    const section = page.getByTestId("job-section-curriculo")
    await section.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(section.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })
    await section.getByTestId("cv-reassess-submit").click()
    const edit = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(edit).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(edit.getByTestId("cv-no-changes")).toBeVisible()
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake.pdf")

    writeFileSync(`${E2E_FAKE_DISPATCH_STATE}/cv-renderer`, "invalid\n")
    await page.reload()
    await expect(section.getByRole("alert")).toContainText("chave do renderer do currículo está inválida")
    await expect(section.getByTestId("dispatch-button-GERAR_CURRICULO")).toBeDisabled()
  })

  test("pedir edição do currículo: seu texto vai ao Claude (Hermes) ou vira comando do CV Operator (Grok)", async ({
    page,
  }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(120_000)
    await page.goto("/vaga/fake-1001")
    const section = page.getByTestId("job-section-curriculo")
    const form = section.getByTestId("cv-edit")
    // No résumé yet: only that technical reason disables the request.
    await expect(form.getByTestId("cv-edit-disabled")).toHaveText("Gere o currículo desta vaga antes de pedir edição.")
    await expect(form.getByTestId("cv-edit-input")).toBeDisabled()
    await section.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(section.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake.pdf")

    const input = form.getByTestId("cv-edit-input")
    await expect(input).toBeEnabled()
    await input.fill("pode enviar, ok 1a2b3c4d")
    await expect(form.getByTestId("cv-edit-problem")).toContainText("aprovação")
    await expect(form.getByTestId("cv-edit-submit")).toBeDisabled()
    const request = "Troque o headline para Engenharia Química | Processos e Dados e tire a categoria Power BI."
    await input.fill(request)
    await expect(form.getByTestId("cv-edit-count")).toHaveText(`${request.length}/1500`)
    await expect(form.getByTestId("cv-edit-submit")).toHaveText("Pedir edição · Hermes")
    await form.getByTestId("cv-edit-submit").click()
    const edit = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(edit.getByTestId("cv-edit-request")).toContainText(request)
    await expect(edit).toContainText("Claude in Chrome (host) · Hermes")
    await expect(input).toHaveValue("")
    await expect(form.getByTestId("cv-edit-disabled")).toHaveText("Edição em andamento.")
    await expect(edit).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    // The edited PDF (-v2) replaces the preview; the previous one is kept by job-search.
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake-v2.pdf")

    // Grok: the same request becomes a fixed command for the CV Operator (the text stays in job-search's file).
    await form.getByTestId("platform-grok").click()
    await input.fill("Encurte o resumo usando só as frases que já estão nele.")
    await expect(form.getByTestId("cv-edit-submit")).toHaveText("Pedir edição · Grok")
    await form.getByTestId("cv-edit-submit").click()
    const manual = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(manual).toHaveAttribute("data-status", "MANUAL")
    await expect(manual.getByTestId("grok-command")).toContainText("cv_claude_chrome.py edit fake-1001 --op-dir")
    await expect(manual.getByTestId("grok-command")).not.toContainText("Encurte o resumo")
  })

  test("pedir edição com revisão no ChatGPT: o switch muda o caminho e uma dúvida para antes do Claude", async ({
    page,
  }) => {
    // The fake advances one stage per poll (5 s); a request mentioning "sem lastro" gets doubts from the ChatGPT.
    test.setTimeout(150_000)
    await page.goto("/vaga/fake-1001")
    const section = page.getByTestId("job-section-curriculo")
    const form = section.getByTestId("cv-edit")
    await section.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(section.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "CONCLUIDO", {
      timeout: 30_000,
    })

    // Off by default: the request goes straight to Claude, as before.
    const toggle = form.getByRole("switch", { name: "Revisar o pedido no ChatGPT antes" })
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(form.getByTestId("cv-edit-description")).toContainText("direto ao Claude in Chrome")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(form.getByTestId("cv-edit-description")).toContainText("O ChatGPT lê seu pedido antes")
    const input = form.getByTestId("cv-edit-input")
    await input.fill("Coloque Python sem lastro na experiência da Acme, por favor.")
    await expect(form.getByTestId("cv-edit-submit")).toHaveText("Pedir edição · Hermes + ChatGPT")
    await form.getByTestId("cv-edit-submit").click()
    const stuck = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(stuck.locator('[data-stage="chatgpt"]')).toHaveCount(1)
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(stuck).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await expect(stuck.locator('[data-stage="chatgpt"]')).toHaveAttribute("data-state", "failed")
    await expect(stuck.locator('[data-stage="claude"]')).toHaveAttribute("data-state", "pending")
    await expect(stuck.getByTestId("cv-edit-doubts")).toContainText("as evidências não mostram Python")
    await expect(stuck).toContainText("nada foi ao Claude")

    // Rewritten request: ChatGPT, then Claude, then the new PDF.
    await toggle.click()
    await input.fill("Troque o headline para Engenharia Química | Processos e Dados.")
    await form.getByTestId("cv-edit-submit").click()
    const edit = section.getByTestId("dispatch-EDITAR_CURRICULO")
    await expect(edit).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 45_000 })
    await expect(edit.locator('[data-stage="chatgpt"]')).toHaveAttribute("data-state", "done")
    await expect(section.getByTestId("cv-preview-filename")).toHaveText("curriculo_igor-fernandes_pt_fake-v2.pdf")

    // Grok never carries the text: the review is off and disabled, with the reason.
    await form.getByTestId("platform-grok").click()
    await expect(toggle).toBeDisabled()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(form.getByTestId("cv-edit-review-hermes-only")).toBeVisible()
  })

  test('currículo travado: motivo claro, opções e "Outro" com texto para o ChatGPT', async ({ page }) => {
    // The fake advances one stage per poll (5 s); fake-1003 stops in the Claude step the first time.
    test.setTimeout(90_000)
    await page.goto("/vaga/fake-1003")
    const ops = page.getByTestId("job-detail")
    await ops.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    const stuck = ops.getByTestId("dispatch-GERAR_CURRICULO")
    await expect(stuck).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await expect(stuck.locator('[data-stage="curriculinho"]')).toHaveAttribute("data-state", "failed")
    await expect(stuck).toContainText("escolha como seguir")
    await expect(stuck).not.toContainText("veja o código")

    // job-search's reason, Claude's own MOTIVO and the end of its reply, as plain text (no HTML from the bot).
    const recovery = stuck.getByTestId("cv-recovery")
    await expect(recovery.getByTestId("cv-recovery-reason")).toHaveText("O Claude in Chrome parou sem exportar o PDF.")
    await expect(recovery.getByTestId("cv-recovery-claude-reason")).toContainText("não tem bloco correspondente")
    await expect(recovery.getByTestId("cv-recovery-claude-reply")).toContainText("<b>sem</b>")
    await expect(recovery.locator("b")).toHaveCount(0)

    // Options from job-search plus "Outro" (always last); nothing is sent before a choice.
    await expect(recovery.getByTestId("cv-resume-option-claude")).toContainText("Refazer só a edição no Claude")
    await expect(recovery.getByTestId("cv-resume-option-chatgpt")).toContainText("Refazer o patch no ChatGPT")
    await expect(recovery.getByTestId("cv-resume-submit")).toBeDisabled()
    await recovery.getByTestId("cv-resume-option-claude").click()
    await expect(recovery.getByTestId("cv-resume-submit")).toBeEnabled()
    await recovery.getByTestId("cv-resume-option-outro").click()
    const note = recovery.getByTestId("cv-resume-input")
    await note.fill("pode seguir, ok 1a2b3c4d")
    await expect(recovery.getByTestId("cv-resume-problem")).toContainText("aprovação")
    await expect(recovery.getByTestId("cv-resume-submit")).toBeDisabled()
    await note.fill("pode tirar a categoria Python do grid")
    await expect(recovery.getByTestId("cv-resume-count")).toHaveText("37/1500")
    await recovery.getByTestId("cv-resume-submit").click()

    // One card again: the new run says what it resumes, has no recovery and finishes.
    const resumed = ops.getByTestId("dispatch-GERAR_CURRICULO")
    await expect(resumed.getByTestId("cv-resumes")).toContainText("patch novo no ChatGPT")
    await expect(resumed.getByTestId("cv-recovery")).toHaveCount(0)
    await expect(resumed).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
  })

  test("analisar vaga enviada: confirmação, etapas, diagnóstico e registro na planilha", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    // fake-1006 is ENVIADA: the analysis, like every action, is still offered (the user chooses).
    await page.goto("/vaga/fake-1006")
    const ops = page.getByTestId("job-detail")
    await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeEnabled()
    const button = ops.getByTestId("analyze-button")
    await expect(button).toBeEnabled()
    await expect(button).toHaveText("Analisar")

    // Cancel never dispatches; the dialog has no platform toggle (Hermes only).
    await button.click()
    const dialog = page.getByTestId("analyze-dialog")
    await expect(dialog).toContainText("fake-1006")
    await expect(dialog).toContainText("Candidatura, datas e observações não mudam")
    await expect(dialog.getByTestId("platform-grok")).toHaveCount(0)
    await page.getByTestId("analyze-cancel").click()
    await expect(ops.getByTestId("dispatch-ANALISAR_VAGA")).toHaveCount(0)

    await button.click()
    await page.getByTestId("analyze-confirm").click()
    const card = ops.getByTestId("dispatch-ANALISAR_VAGA")
    await expect(card).toBeVisible()
    await expect(ops.getByTestId("analyze-button")).toBeDisabled()
    await expect(card).toContainText("ChatGPT (host) · Hermes")

    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    for (const stage of ["planilha", "posting", "analise", "writeset"]) {
      await expect(card.locator(`[data-stage="${stage}"]`)).toHaveAttribute("data-state", "done")
    }
    await expect(card.getByTestId("analysis-diagnosis")).toContainText("NÃO PRIORIZADA")
    await expect(card.getByTestId("analysis-diagnosis")).toContainText("Diagnóstico do ChatGPT")
    await expect(ops.getByTestId("analyze-button")).toBeEnabled()

    // Registration is the existing writeset flow: job-search writes, the panel only asks and re-reads.
    const registration = card.getByTestId("writeset-registration")
    await registration.getByTestId("register-writeset").click()
    await expect(page.getByTestId("register-dialog")).toContainText("1 vaga")
    await page.getByTestId("register-confirm").click()
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(card.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "done")
  })

  test("analisar: vaga com dossier oferece refazer; vaga sem texto pede você", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/vaga/fake-1001")
    await expect(page.getByTestId("job-detail").getByTestId("analyze-button")).toHaveText("Refazer análise")
    await page.getByTestId("job-detail").getByTestId("analyze-button").click()
    await expect(page.getByTestId("analyze-dialog")).toContainText("O dossier novo é anexado")
    await page.getByTestId("analyze-cancel").click()

    // fake-1008: no posting anywhere, so job-search stops and asks the user (never invents the text).
    await page.goto("/vaga/fake-1008")
    const ops = page.getByTestId("job-detail")
    await ops.getByTestId("analyze-button").click()
    await page.getByTestId("analyze-confirm").click()
    const card = ops.getByTestId("dispatch-ANALISAR_VAGA")
    await expect(card).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 20_000 })
    await expect(card.locator('[data-stage="posting"]')).toHaveAttribute("data-state", "failed")
    await expect(card).toContainText("POSTING_UNAVAILABLE")
    await expect(card).toContainText("não achou o texto desta vaga")
    await expect(card.getByTestId("writeset-registration")).toHaveCount(0)
  })

  test("grok: seletor de plataforma gera o comando para colar", async ({ page }) => {
    await page.goto("/vaga/fake-1001")
    await page.getByTestId("job-detail").getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-dialog").getByTestId("platform-grok").click()
    await expect(page.getByTestId("dispatch-dialog").getByTestId("platform-grok")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await page.getByTestId("dispatch-confirm").click()
    await expect(page.getByTestId("dispatch-dialog").getByTestId("grok-command")).toContainText("[painel:dispatch")
    await page.getByTestId("dispatch-cancel").click()
    await expect(page.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "MANUAL")
    // The choice sticks for the next dispatch in this browser.
    await page.reload()
    await page.getByTestId("job-detail").getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await expect(page.getByTestId("dispatch-dialog").getByTestId("platform-grok")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })

  test("nenhum estado da vaga desativa currículo e candidatura; sem análise o job-search explica", async ({ page }) => {
    // ENVIO INCERTO, ENVIADA, NÃO CONFIRMADA and ENCERRADA + NÃO PRIORIZADA: the user chooses (decision 2026-10-02).
    for (const id of ["fake-1007", "fake-1006", "fake-1008", "fake-1010"]) {
      await page.goto(`/vaga/${id}`)
      const ops = page.getByTestId("job-detail")
      await expect(ops.getByTestId("dispatch-button-GERAR_CURRICULO")).toBeEnabled()
      await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeEnabled()
    }
    // fake-1005 was never analysed: the button works and job-search's refusal says what to do.
    await page.goto("/vaga/fake-1005")
    await page.getByTestId("job-detail").getByTestId("dispatch-button-PREENCHER_CANDIDATURA").click()
    await page.getByTestId("dispatch-dialog").getByTestId("platform-hermes").click()
    await page.getByTestId("dispatch-confirm").click()
    await expect(page.getByText('A vaga ainda não foi analisada no job-search: use "Analisar" antes.')).toBeVisible()
  })

  test("descartar vaga: confirmação, carimbo vermelho DESCARTADA e a vaga continua listada", async ({ page }) => {
    // The fake answers like job-search but cannot change the fixture Sheet: fake-1009 is already discarded there.
    await page.goto("/vaga/fake-1002")
    await page.getByTestId("decline-job").click()
    const dialog = page.getByTestId("decline-job-dialog")
    await expect(dialog).toContainText("RETIRADA")
    await expect(dialog).toContainText("Não dá para desfazer")
    await page.getByTestId("decline-job-cancel").click()
    await expect(dialog).toBeHidden()
    await page.getByTestId("decline-job").click()
    await page.getByTestId("decline-job-confirm").click()
    await expect(page.getByText("Vaga descartada e marcada como RETIRADA na planilha.")).toBeVisible()

    // A discarded job keeps its card: red state, "descartada" stamp, no discard button.
    await page.goto("/vaga/fake-1009")
    await expect(page.getByTestId("state-badge").first()).toHaveAttribute("data-state", "descartada")
    await expect(page.getByTestId("declined-stamp")).toHaveText("descartada")
    await expect(page.getByTestId("decline-job")).toHaveCount(0)
    // Sent and uncertain applications cannot be discarded.
    for (const id of ["fake-1006", "fake-1007"]) {
      await page.goto(`/vaga/${id}`)
      await expect(page.getByTestId("job-detail")).toBeVisible()
      await expect(page.getByTestId("decline-job")).toHaveCount(0)
    }

    // "Hoje": the queue offers the button; the discarded job leaves the queue but stays on its own shelf.
    await page.goto("/")
    await expect(page.getByTestId("queue-list").getByTestId("decline-job").first()).toBeVisible()
    await expect(page.getByTestId("queue-list").locator('[data-job-id="fake-1009"]')).toHaveCount(0)
    const declined = page.getByTestId("declined-list").locator('[data-job-id="fake-1009"]')
    await expect(declined).toHaveAttribute("data-state", "descartada")
    await expect(declined.getByTestId("declined-stamp")).toBeVisible()
  })

  test("confirmar vaga aberta: em NÃO CONFIRMADA e ENCERRADA, com confirmação; currículo e candidatura não dependem disso", async ({
    page,
  }) => {
    // The fake answers like job-search but cannot change the fixture Sheet: fake-1008 stays NÃO CONFIRMADA.
    await page.goto("/vaga/fake-1008")
    const ops = page.getByTestId("job-detail")
    await expect(ops.getByTestId("dispatch-button-GERAR_CURRICULO")).toBeEnabled()
    await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeEnabled()
    await page.getByTestId("confirm-open").click()
    const dialog = page.getByTestId("confirm-open-dialog")
    await expect(dialog).toContainText("só confere sozinho as vagas do LinkedIn")
    await page.getByTestId("confirm-open-cancel").click()
    await expect(dialog).toBeHidden()
    await page.getByTestId("confirm-open").click()
    await page.getByTestId("confirm-open-confirm").click()
    await expect(page.getByText("Disponibilidade gravada como ABERTA na planilha e no dossier.")).toBeVisible()

    // fake-1010: NÃO PRIORIZADA and marked ENCERRADA by a wrong automatic read (like Gupy 12478822). The résumé is
    // available; the application waits for the user to reopen it, behind a dialog that says it reopens a closed job.
    await page.goto("/vaga/fake-1010")
    await expect(ops.getByTestId("dispatch-button-GERAR_CURRICULO")).toBeEnabled()
    await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeEnabled()
    await page.getByTestId("confirm-open").click()
    await expect(dialog).toContainText("Reabrir uma vaga marcada como ENCERRADA?")
    await expect(dialog).toContainText("guarda o valor antigo")
    await page.getByTestId("confirm-open-confirm").click()
    await expect(page.getByText("Disponibilidade gravada como ABERTA na planilha e no dossier.").last()).toBeVisible()

    // Open, archived closed, sent and withdrawn jobs have no confirmation button.
    for (const id of ["fake-1002", "fake-0999", "fake-1006", "fake-1009"]) {
      await page.goto(`/vaga/${id}`)
      await expect(page.getByTestId("job-detail")).toBeVisible()
      await expect(page.getByTestId("confirm-open")).toHaveCount(0)
    }
  })

  test("excluir vaga: confirmação digitando o job_id, some da planilha e volta para a lista", async ({ page }) => {
    // The fake answers like job-search but cannot change the fixture Sheet (fake-1002 answers DELETE_PARTIAL).
    await page.goto("/vaga/fake-1004")
    await page.getByTestId("delete-job").click()
    const dialog = page.getByTestId("delete-job-dialog")
    await expect(dialog).toContainText("backup local")
    await expect(dialog).toContainText("Descartar vaga")
    await expect(dialog).toContainText("Não dá para desfazer")
    const input = page.getByTestId("delete-job-input")
    const confirm = page.getByTestId("delete-job-confirm")
    await expect(confirm).toBeDisabled()
    await input.fill("fake-100")
    await expect(confirm).toBeDisabled()
    await page.getByTestId("delete-job-cancel").click()
    await expect(dialog).toBeHidden()
    await page.getByTestId("delete-job").click()
    await expect(input).toHaveValue("")
    await input.fill("fake-1004")
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByText("Vaga excluída da planilha")).toBeVisible()
    await expect(page).toHaveURL(/\/vagas$/)

    // A partial delete is never shown as success: the user stays on the job to sync and retry.
    await page.goto("/vaga/fake-1002")
    await page.getByTestId("delete-job").click()
    await page.getByTestId("delete-job-input").fill("fake-1002")
    await page.getByTestId("delete-job-confirm").click()
    await expect(page.getByText("Exclusão parcial")).toBeVisible()
    await expect(page).toHaveURL(/\/vaga\/fake-1002$/)

    // A discarded job can be deleted (and not discarded again); sent, uncertain and archive-only rows cannot.
    await page.goto("/vaga/fake-1009")
    await expect(page.getByTestId("delete-job")).toBeVisible()
    await expect(page.getByTestId("decline-job")).toHaveCount(0)
    for (const id of ["fake-1006", "fake-1007", "fake-0999"]) {
      await page.goto(`/vaga/${id}`)
      await expect(page.getByTestId("job-detail")).toBeVisible()
      await expect(page.getByTestId("delete-job")).toHaveCount(0)
    }
  })
})
