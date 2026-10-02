"use client"

import { useSyncExternalStore } from "react"

// Which "vaga indicada" cards the user collapsed or closed. Only view preferences of this browser, keyed by dispatch
// id so they survive reloads: a registered intake stays in play until the next one. Nothing here touches the
// dispatcher (no ack, discard or delete).

export const COLLAPSED_KEY = "estagios:cards-recolhidos"
export const CLOSED_KEY = "estagios:cards-fechados"
/** Old ids fall off the end; only recent cards are ever on screen. */
export const ID_PREF_MAX = 50

export function parseIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

/** Newest first, no duplicates, at most ID_PREF_MAX. */
export function withId(ids: readonly string[], id: string, on: boolean): string[] {
  const rest = ids.filter((item) => item !== id)
  return (on ? [id, ...rest] : rest).slice(0, ID_PREF_MAX)
}

function idSetPref(key: string) {
  const changeEvent = `${key}-change`
  // Fallback when storage is blocked: the choice then lasts until the page is reloaded.
  let memory: string[] = []

  const read = (): string[] => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? memory : parseIds(stored)
    } catch {
      return memory
    }
  }

  const write = (id: string, on: boolean): void => {
    memory = withId(read(), id, on)
    try {
      window.localStorage.setItem(key, JSON.stringify(memory))
    } catch {
      // Storage blocked: memory keeps the choice for this page load.
    }
    window.dispatchEvent(new Event(changeEvent))
  }

  const subscribe = (onChange: () => void): (() => void) => {
    window.addEventListener("storage", onChange)
    window.addEventListener(changeEvent, onChange)
    return () => {
      window.removeEventListener("storage", onChange)
      window.removeEventListener(changeEvent, onChange)
    }
  }

  /** Off by default; a `null` id is always off. */
  const useFlag = (id: string | null): boolean =>
    useSyncExternalStore(
      subscribe,
      () => id !== null && read().includes(id),
      () => false
    )

  return { useFlag, write }
}

const collapsedPref = idSetPref(COLLAPSED_KEY)
const closedPref = idSetPref(CLOSED_KEY)

/** Cards start open (details visible). */
export const useCollapsed = collapsedPref.useFlag
export const writeCollapsed = collapsedPref.write
/** Closed: the intake pair leaves the panel until reopened or replaced by a newer intake. */
export const useClosed = closedPref.useFlag
export const writeClosed = closedPref.write
