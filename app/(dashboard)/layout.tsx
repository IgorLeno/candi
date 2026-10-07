import type React from "react"
import { requireAllowedSession } from "@/lib/auth/session"
import { Sidebar } from "@/components/sidebar"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"

// Every dashboard page lives in this group, so the session is checked server-side even if
// a request ever bypassed `proxy.ts`.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAllowedSession()
  return (
    <div className="min-h-screen bg-background mesh-bg">
      <Sidebar opsEnabled={isDispatchEnabled()} />
      <main className="min-h-screen lg:ml-64">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
