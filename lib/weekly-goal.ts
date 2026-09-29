"use client"

import { useSyncExternalStore } from "react"

// Weekly application goal: a personal preference of this browser, not job-search data. It lives in
// localStorage; when storage is unavailable (private window, blocked site data) the default applies.

export const WEEKLY_GOAL_KEY = "estagios:meta-semanal"
export const DEFAULT_WEEKLY_GOAL = 5
export const WEEKLY_GOAL_MIN = 1
export const WEEKLY_GOAL_MAX = 30
const CHANGE_EVENT = "estagios:meta-semanal-change"

/** Integer in [MIN, MAX]; anything else becomes the default. */
export function parseWeeklyGoal(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < WEEKLY_GOAL_MIN || value > WEEKLY_GOAL_MAX) return DEFAULT_WEEKLY_GOAL
  return value
}

function read(): number {
  try {
    return parseWeeklyGoal(window.localStorage.getItem(WEEKLY_GOAL_KEY))
  } catch {
    return DEFAULT_WEEKLY_GOAL
  }
}

/** Saves the goal; returns false when the browser refuses storage, so the caller can say so. */
export function writeWeeklyGoal(goal: number): boolean {
  try {
    window.localStorage.setItem(WEEKLY_GOAL_KEY, String(goal))
    window.dispatchEvent(new Event(CHANGE_EVENT))
    return true
  } catch {
    return false
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** Current goal; the server render (and first client render) use the default. */
export function useWeeklyGoal(): number {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_WEEKLY_GOAL)
}
