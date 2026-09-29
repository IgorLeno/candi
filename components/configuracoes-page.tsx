"use client"

import type React from "react"
import { useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Palette, Target } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WEEKLY_GOAL_MAX, WEEKLY_GOAL_MIN, parseWeeklyGoal, useWeeklyGoal, writeWeeklyGoal } from "@/lib/weekly-goal"

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="rounded-2xl border-border bg-card shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-st-open">
            <Icon className="h-5 w-5 text-st-open-ink" aria-hidden="true" />
          </span>
          <span className="font-display text-xl text-foreground">{title}</span>
        </CardTitle>
        <CardDescription className="text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function WeeklyGoalForm() {
  const goal = useWeeklyGoal()
  // null = the field shows the stored goal; a string = the user is editing.
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? String(goal)
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= WEEKLY_GOAL_MIN && parsed <= WEEKLY_GOAL_MAX

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-end sm:justify-between"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        if (writeWeeklyGoal(parseWeeklyGoal(value))) {
          setDraft(null)
          toast.success(`Meta salva: ${parsed} por semana.`)
        } else {
          toast.error("O navegador bloqueou o armazenamento local; a meta não foi salva.")
        }
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold text-foreground">Candidaturas por semana</span>
        <span className="text-sm text-muted-foreground">
          O anel da tela Hoje enche conforme as candidaturas com data nesta semana. Fica salvo neste navegador.
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={WEEKLY_GOAL_MIN}
          max={WEEKLY_GOAL_MAX}
          step={1}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={!valid}
          aria-describedby="weekly-goal-error"
          className="mt-1 w-28 bg-background"
          data-testid="weekly-goal-input"
        />
        {!valid && (
          <span id="weekly-goal-error" className="text-sm text-destructive">
            Use um número inteiro de {WEEKLY_GOAL_MIN} a {WEEKLY_GOAL_MAX}.
          </span>
        )}
      </label>
      <Button type="submit" data-testid="weekly-goal-save">
        Salvar meta
      </Button>
    </form>
  )
}

const noopSubscribe = () => () => {}

export function ConfiguracoesPage() {
  const { theme, setTheme } = useTheme()
  // next-themes only knows the theme on the client; the server render (and hydration) must show none.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )

  return (
    <div className="max-w-4xl space-y-6">
      <SettingsCard icon={Target} title="Meta semanal" description="Quantas candidaturas você quer enviar por semana.">
        <WeeklyGoalForm />
      </SettingsCard>

      <SettingsCard icon={Palette} title="Aparência" description="Tema claro, escuro ou o do sistema.">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
          <div>
            <h3 className="mb-1 font-semibold text-foreground">Tema</h3>
            <p className="text-sm text-muted-foreground">Escolha entre tema claro, escuro ou automático</p>
          </div>
          <Select value={mounted ? (theme ?? "") : ""} onValueChange={setTheme}>
            <SelectTrigger className="w-[140px] border-border bg-background">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card">
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Escuro</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsCard>
    </div>
  )
}
