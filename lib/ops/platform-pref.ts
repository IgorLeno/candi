"use client"

import { useSyncExternalStore } from "react"
import { PLATFORMS, type Platform } from "@/lib/ops/schema"

// Which bot platform the dispatch buttons use (credits vary between Hermes and Grok). A preference of this
// browser, like the weekly goal; without storage the default applies.

export const PLATFORM_KEY = "estagios:plataforma-bots"
export const DEFAULT_PLATFORM: Platform = "hermes"
const CHANGE_EVENT = "estagios:plataforma-bots-change"

export function parsePlatform(raw: string | null): Platform {
  return (PLATFORMS as readonly string[]).includes(raw ?? "") ? (raw as Platform) : DEFAULT_PLATFORM
}

function read(): Platform {
  try {
    return parsePlatform(window.localStorage.getItem(PLATFORM_KEY))
  } catch {
    return DEFAULT_PLATFORM
  }
}

/** Saves the platform; returns false when the browser refuses storage. */
export function writePlatform(platform: Platform): boolean {
  try {
    window.localStorage.setItem(PLATFORM_KEY, platform)
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

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PLATFORM)
}
