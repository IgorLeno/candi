import "server-only"
import { isDispatchEnabled, runDispatcher } from "@/lib/ops/dispatcher"
import { todayResultSchema, type TodayList } from "@/lib/ops/schema"

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
