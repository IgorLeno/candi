import "server-only"
import { isDispatchEnabled, runDispatcher } from "@/lib/ops/dispatcher"
import { todayResultSchema, todaySettingsResultSchema, type TodayList, type TodaySettingsView } from "@/lib/ops/schema"

/**
 * The Hoje list of the last "Atualizar lista" (`dispatch.py today`, plan 2026-10-16). Null before the first one, with
 * the dispatcher off or unreadable: Hoje then keeps the Sheet rule (SELECIONADA + ABERTA). `failed` tells the page the
 * list could not be read, so it says so instead of silently showing the old rule.
 */
export async function readTodayList(): Promise<{ list: TodayList | null; failed: boolean }> {
  if (!isDispatchEnabled()) return { list: null, failed: false }
  const result = await runDispatcher(["today"], todayResultSchema)
  return result.ok ? { list: result.value.today, failed: false } : { list: null, failed: true }
}

/**
 * The Hoje settings for the line under "Atualizar lista" (front B: the automatic refresh, its next run and last skip).
 * Null with the dispatcher off or unreadable: the line then says nothing about the automatic refresh.
 */
export async function readTodaySettings(): Promise<TodaySettingsView | null> {
  if (!isDispatchEnabled()) return null
  const result = await runDispatcher(["today-settings"], todaySettingsResultSchema)
  return result.ok ? { settings: result.value.settings, next_run_at: result.value.next_run_at } : null
}
