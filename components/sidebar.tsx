"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Flame, LayoutGrid, LogOut, Radar, Settings2 } from "lucide-react"
import { signOutAction } from "@/app/actions/auth"
import { CandiMark } from "@/components/brand/candi-logo"
import { InProgressChip, InProgressSection, useAttention } from "@/components/in-progress"
import { cn } from "@/lib/utils"

const menuItems = [
  { id: "hoje", href: "/", label: "Hoje", icon: Flame },
  { id: "cotar", href: "/cotar", label: "Cotar vagas", icon: Radar },
  { id: "vagas", href: "/vagas", label: "Vagas", icon: LayoutGrid },
  { id: "analise", href: "/analise", label: "Análise", icon: BarChart3 },
  { id: "configuracoes", href: "/configuracoes", label: "Configurações", icon: Settings2 },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  // A job page belongs to the list section.
  if (href === "/vagas") return pathname.startsWith("/vagas") || pathname.startsWith("/vaga/")
  return pathname.startsWith(href)
}

// No prefetch, as on the overview links: every dashboard page is a full dynamic render.

/**
 * Fixed sidebar on large screens; a compact top bar with the same links below `lg`. With bot dispatch on, both carry
 * "Em andamento" (one shared poll).
 */
export function Sidebar({ opsEnabled = false }: { opsEnabled?: boolean }) {
  const pathname = usePathname()
  const attention = useAttention(opsEnabled)

  return (
    <>
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar z-50 lg:flex">
        <div className="absolute inset-0 mesh-bg pointer-events-none" />

        <div className="relative px-5 pt-6 pb-4 flex items-center gap-3">
          <CandiMark className="w-10 h-10" />
          <div>
            <span className="font-display text-sidebar-primary text-lg font-bold tracking-tight block leading-tight">
              Candi
            </span>
            <span className="text-sidebar-foreground/80 text-xs tracking-wide">central do candidato</span>
          </div>
        </div>

        <div className="relative px-5 mb-2">
          <div className="h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
        </div>

        <nav aria-label="Navegação principal" className="relative flex-1 flex flex-col px-3 gap-0.5 mt-3">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link
                prefetch={false}
                key={item.id}
                href={item.href}
                data-testid={`sidebar-${item.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full h-11 rounded-xl flex items-center gap-3 px-3 transition-colors duration-200 relative",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-border/40"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span className={cn("text-sm font-medium", active && "font-semibold")}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <InProgressSection attention={attention} />

        <form action={signOutAction} className="relative px-3 pb-6">
          <button
            type="submit"
            data-testid="sidebar-sair"
            className={cn(
              "w-full h-10 rounded-lg flex items-center gap-3 px-3 transition-colors duration-200",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              "text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-border/40"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </form>
      </aside>

      <header className="sticky top-0 z-50 border-b border-sidebar-border bg-sidebar lg:hidden">
        <div className="flex items-center gap-2 px-4 pt-3">
          <CandiMark className="w-7 h-7" />
          <span className="font-display text-sidebar-primary text-base font-bold">Candi</span>
          <div className="ml-auto">
            <InProgressChip attention={attention} />
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              data-testid="mobile-sair"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-sidebar-foreground hover:text-sidebar-primary"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
        <nav aria-label="Navegação principal" className="flex gap-1 overflow-x-auto px-3 py-2">
          {menuItems.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                prefetch={false}
                key={item.id}
                href={item.href}
                data-testid={`mobile-nav-${item.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground hover:text-sidebar-primary"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
    </>
  )
}
