"use client"

import { useEffect, useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { getCvDoc, saveCvManual } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  addBullet,
  addBulletBlocker,
  addItem,
  addItemBlocker,
  addLink,
  checkManualDoc,
  moveItem,
  removeBullet,
  removeItem,
  removeItemBlocker,
  removeLink,
  setBullet,
  setHeader,
  setItemField,
  setLine,
  setRow,
  setSectionText,
} from "@/lib/ops/cv-manual"
import { refusalText } from "@/lib/ops/present"
import type { CvDoc, CvDocument, CvSection } from "@/lib/ops/schema"

// Generic labels by position (request 2026-10-10): the item's saved name goes stale after a reorder.
const NOUN: Record<string, string> = {
  experience: "Experiência",
  projects: "Projeto",
  education: "Formação",
  skills: "Competência",
  certifications: "Certificação",
  languages: "Idioma",
}
const HEADER: [keyof CvDocument["header"], string][] = [
  ["name", "Nome"],
  ["headline", "Título profissional"],
  ["location", "Local e disponibilidade"],
  ["contact", "Contato"],
]

function noun(sectionId: string): string {
  return NOUN[sectionId] ?? "Item"
}

/** Generic label of a job-search path in the edited document, for an error message. */
function pathLabel(doc: CvDocument, path: string): string {
  const [sid, id, field, sub] = path.split("/")
  if (sid === "header") return HEADER.find(([key]) => key === id)?.[1] ?? "Cabeçalho"
  const section = doc.sections.find((s) => s.id === sid)
  if (!section) return path
  if (!id || id === "title") return `${section.title} · título da seção`
  if (id === "text") return section.title
  const list =
    section.kind === "entries"
      ? section.items
      : section.kind === "pairs"
        ? section.rows
        : section.kind === "lines"
          ? section.lines
          : []
  const index = list.findIndex((item) => item.id === id)
  const name = `${noun(sid)} ${index + 1}`
  if (field === "bullets" && section.kind === "entries") {
    const bullet = section.items[index]?.bullets.findIndex((b) => b.id === sub) ?? -1
    return `${name} · Bullet ${bullet + 1}`
  }
  const fieldName: Record<string, string> = {
    title: "Título",
    date: "Data",
    org: "Instituição",
    link: "Link",
    label: "Rótulo",
    text: "Texto",
  }
  return field ? `${name} · ${fieldName[field] ?? field}` : name
}

function TextField({
  id,
  label,
  value,
  max,
  rows = 1,
  disabled,
  onChange,
  action,
}: {
  id: string
  label: string
  value: string
  max: number
  rows?: number
  disabled: boolean
  onChange: (text: string) => void
  action?: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`manual-${id}`} className="text-xs">
          {label}
        </Label>
        {action}
      </div>
      <Textarea
        id={`manual-${id}`}
        value={value}
        rows={rows}
        disabled={disabled}
        data-testid={`cv-manual-${id}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-right text-xs text-muted-foreground">
        {[...value].length}/{max}
      </p>
    </div>
  )
}

function IconAction({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string
  testId: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-1.5"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/** One option of a "+" menu; a disabled one says why (structure limits are job-search's, kept on 2026-10-10). */
function MenuOption({
  label,
  blocker,
  testId,
  onSelect,
}: {
  label: string
  blocker?: string | null
  testId: string
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem disabled={!!blocker} data-testid={testId} onSelect={onSelect}>
      <span>{label}</span>
      {blocker && <span className="ml-2 text-xs text-muted-foreground">({blocker})</span>}
    </DropdownMenuItem>
  )
}

function PlusMenu({
  label,
  testId,
  disabled,
  children,
}: {
  label: string
  testId: string
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          aria-label={label}
          title={label}
          disabled={disabled}
          data-testid={testId}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * "Editar currículo" → Manual (cv-manual/2, docs/plans/2026-10-10-edicao-manual-flexivel.md): every field is editable
 * (the text is the user's own), bullets, links and items can be added, removed and reordered within job-search's
 * limits. The whole document goes to job-search over stdin, which checks it again; no AI.
 */
export function CvManualEditor({
  jobId,
  disabledReason,
  onStarted,
}: {
  jobId: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const [original, setOriginal] = useState<CvDoc | null>(null)
  const [doc, setDoc] = useState<CvDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let alive = true
    getCvDoc(jobId)
      .then((result) => {
        if (!alive) return
        if (result.ok) {
          setOriginal(result.value)
          setDoc(result.value.doc)
        } else setError(result.code)
      })
      .catch(() => {
        if (alive) setError("DISPATCHER_UNAVAILABLE")
      })
    return () => {
      alive = false
    }
  }, [jobId])
  const checked = original && doc ? checkManualDoc(original, doc) : null
  const off = !!disabledReason || pending
  const max = original?.max_len
  const limits = original?.limits
  const failedPath = checked && !checked.ok ? checked.code.split(":")[1] : undefined

  function itemBlock(section: CvSection, index: number) {
    if (!doc || !max || !limits) return null
    const sid = section.id
    const key = `${sid}-${index + 1}`
    const name = `${noun(sid)} ${index + 1}`
    const count =
      section.kind === "entries"
        ? section.items.length
        : section.kind === "pairs"
          ? section.rows.length
          : section.kind === "lines"
            ? section.lines.length
            : 0
    const menu = (
      <PlusMenu label={`Opções de ${name}`} testId={`cv-manual-${key}-menu`} disabled={off}>
        {section.kind === "entries" && (
          <>
            <MenuOption
              label="Adicionar bullet"
              blocker={addBulletBlocker(section, index, limits)}
              testId={`cv-manual-${key}-add-bullet`}
              onSelect={() => setDoc(addBullet(doc, sid, index))}
            />
            {sid === "projects" && !section.items[index].link && (
              <MenuOption
                label="Adicionar link"
                testId={`cv-manual-${key}-add-link`}
                onSelect={() => setDoc(addLink(doc, sid, index))}
              />
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <MenuOption
          label="Mover para cima"
          blocker={index === 0 ? "já é o primeiro" : null}
          testId={`cv-manual-${key}-up`}
          onSelect={() => setDoc(moveItem(doc, sid, index, -1))}
        />
        <MenuOption
          label="Mover para baixo"
          blocker={index === count - 1 ? "já é o último" : null}
          testId={`cv-manual-${key}-down`}
          onSelect={() => setDoc(moveItem(doc, sid, index, 1))}
        />
        <DropdownMenuSeparator />
        <MenuOption
          label={`Remover ${name.toLowerCase()}`}
          blocker={removeItemBlocker(section)}
          testId={`cv-manual-${key}-remove`}
          onSelect={() => setDoc(removeItem(doc, sid, index))}
        />
      </PlusMenu>
    )
    let body: React.ReactNode = null
    if (section.kind === "entries") {
      const item = section.items[index]
      body = (
        <>
          <TextField
            id={`${key}-title`}
            label="Título"
            value={item.title}
            max={max.field}
            disabled={off}
            onChange={(t) => setDoc(setItemField(doc, sid, index, "title", t))}
          />
          {item.date !== undefined && (
            <TextField
              id={`${key}-date`}
              label="Data"
              value={item.date}
              max={max.field}
              disabled={off}
              onChange={(t) => setDoc(setItemField(doc, sid, index, "date", t))}
            />
          )}
          {item.org && (
            <>
              <TextField
                id={`${key}-org-strong`}
                label="Instituição (negrito, pode ficar vazio)"
                value={item.org.strong}
                max={max.field}
                disabled={off}
                onChange={(t) => setDoc(setItemField(doc, sid, index, "strong", t))}
              />
              <TextField
                id={`${key}-org-rest`}
                label="Instituição (resto)"
                value={item.org.rest}
                max={max.field}
                disabled={off}
                onChange={(t) => setDoc(setItemField(doc, sid, index, "rest", t))}
              />
            </>
          )}
          {item.link && (
            <TextField
              id={`${key}-link`}
              label="Link (https://)"
              value={item.link.text}
              max={max.field}
              disabled={off}
              onChange={(t) => setDoc(setItemField(doc, sid, index, "link", t))}
              action={
                <IconAction
                  label={`Remover link de ${name}`}
                  testId={`cv-manual-${key}-remove-link`}
                  disabled={off}
                  onClick={() => setDoc(removeLink(doc, sid, index))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </IconAction>
              }
            />
          )}
          {item.bullets.map((bullet, b) => (
            <TextField
              key={bullet.id}
              id={`${key}-bullet-${b + 1}`}
              label={`Bullet ${b + 1}`}
              value={bullet.text}
              max={max.bullet}
              rows={2}
              disabled={off}
              onChange={(t) => setDoc(setBullet(doc, sid, index, b, t))}
              action={
                <IconAction
                  label={`Remover bullet ${b + 1} de ${name}`}
                  testId={`cv-manual-${key}-remove-bullet-${b + 1}`}
                  disabled={off || item.bullets.length <= 1}
                  onClick={() => setDoc(removeBullet(doc, sid, index, b))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </IconAction>
              }
            />
          ))}
        </>
      )
    } else if (section.kind === "pairs") {
      const row = section.rows[index]
      body = (
        <>
          <TextField
            id={`${key}-label`}
            label="Rótulo"
            value={row.label}
            max={max.field}
            disabled={off}
            onChange={(t) => setDoc(setRow(doc, sid, index, "label", t))}
          />
          <TextField
            id={`${key}-text`}
            label="Texto"
            value={row.text}
            max={max.field}
            disabled={off}
            onChange={(t) => setDoc(setRow(doc, sid, index, "text", t))}
          />
        </>
      )
    } else if (section.kind === "lines") {
      body = (
        <TextField
          id={`${key}-text`}
          label="Texto"
          value={section.lines[index].text}
          max={max.field}
          disabled={off}
          onChange={(t) => setDoc(setLine(doc, sid, index, t))}
        />
      )
    }
    return (
      <div key={key} className="space-y-2 rounded-lg border border-border p-3" data-testid={`cv-manual-${key}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">{name}</p>
          {menu}
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="space-y-3" role="tabpanel" data-testid="cv-manual-editor">
      <p className="text-xs text-muted-foreground">
        Edite qualquer campo, adicione ou remova bullets, links e itens e mude a ordem pelo botão + de cada item. Esta
        edição não usa IA: o job-search confere tudo de novo e mede se cabe em uma página.
      </p>
      {error && (
        <p role="alert" className="text-xs text-st-review-fg">
          {refusalText(error)}
        </p>
      )}
      {!doc && !error && <p className="text-xs text-muted-foreground">Carregando currículo editável…</p>}
      {doc && max && limits && (
        <>
          <div className="space-y-2 border-t border-border pt-3">
            <h4 className="text-sm font-semibold">Cabeçalho</h4>
            {HEADER.map(([key, label]) => (
              <TextField
                key={key}
                id={`header-${key}`}
                label={label}
                value={doc.header[key]}
                max={max.field}
                disabled={off}
                onChange={(t) => setDoc(setHeader(doc, key, t))}
              />
            ))}
          </div>
          {doc.sections.map((section) => {
            const count =
              section.kind === "entries"
                ? section.items.length
                : section.kind === "pairs"
                  ? section.rows.length
                  : section.kind === "lines"
                    ? section.lines.length
                    : 0
            return (
              <div
                key={section.id}
                className="space-y-2 border-t border-border pt-3"
                data-testid={`cv-manual-section-${section.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">{section.title || "Seção sem título"}</h4>
                  {section.kind !== "paragraph" && (
                    <PlusMenu
                      label={`Adicionar em ${section.title}`}
                      testId={`cv-manual-${section.id}-menu`}
                      disabled={off}
                    >
                      <MenuOption
                        label={`Adicionar ${noun(section.id).toLowerCase()}`}
                        blocker={addItemBlocker(section, limits)}
                        testId={`cv-manual-${section.id}-add`}
                        onSelect={() => setDoc(addItem(doc, section.id))}
                      />
                    </PlusMenu>
                  )}
                </div>
                <TextField
                  id={`${section.id}-title`}
                  label="Título da seção"
                  value={section.title}
                  max={max.field}
                  disabled={off}
                  onChange={(t) => setDoc(setSectionText(doc, section.id, "title", t))}
                />
                {section.kind === "paragraph" && (
                  <TextField
                    id={`${section.id}-text`}
                    label="Texto"
                    value={section.text}
                    max={max.paragraph}
                    rows={4}
                    disabled={off}
                    onChange={(t) => setDoc(setSectionText(doc, section.id, "text", t))}
                  />
                )}
                {Array.from({ length: count }, (_, index) => itemBlock(section, index))}
              </div>
            )
          })}
        </>
      )}
      {checked && !checked.ok && checked.code !== "MANUAL_NO_CHANGES" && doc && (
        <p role="alert" className="text-xs text-st-review-fg" data-testid="cv-manual-error">
          {refusalText(checked.code)}
          {failedPath && ` (${pathLabel(doc, failedPath)})`}
        </p>
      )}
      <Button
        size="sm"
        disabled={off || !checked?.ok}
        data-testid="cv-manual-submit"
        onClick={() =>
          startTransition(async () => {
            if (!original || !checked?.ok) return
            try {
              const result = await saveCvManual(jobId, { docSha256: original.doc_sha256, doc: checked.doc })
              if (result.ok) {
                toast.success("Edição manual enviada para gerar o PDF.")
                onStarted()
              } else toast.error(refusalText(result.code))
            } catch {
              toast.error(refusalText("UNAUTHENTICATED"))
            }
          })
        }
      >
        {pending ? "Gerando…" : "Salvar e gerar PDF"}
      </Button>
    </div>
  )
}
