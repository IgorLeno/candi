import { afterEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import {
  CLOSED_KEY,
  COLLAPSED_KEY,
  ID_PREF_MAX,
  parseIds,
  useClosed,
  useCollapsed,
  withId,
  writeClosed,
  writeCollapsed,
} from "@/lib/ops/collapse-pref"

describe("collapse-pref", () => {
  afterEach(() => window.localStorage.clear())

  it("parses only a JSON list of strings", () => {
    expect(parseIds(null)).toEqual([])
    expect(parseIds("not json")).toEqual([])
    expect(parseIds('{"a":1}')).toEqual([])
    expect(parseIds('["a", 2, "b"]')).toEqual(["a", "b"])
  })

  it("keeps the newest ids first, without duplicates, up to the cap", () => {
    expect(withId(["a", "b"], "b", true)).toEqual(["b", "a"])
    expect(withId(["a", "b"], "a", false)).toEqual(["b"])
    const many = Array.from({ length: ID_PREF_MAX }, (_, i) => `id-${i}`)
    const next = withId(many, "new", true)
    expect(next).toHaveLength(ID_PREF_MAX)
    expect(next[0]).toBe("new")
    expect(next).not.toContain(`id-${ID_PREF_MAX - 1}`)
  })

  it("starts open, remembers the choice per id and never collapses a null id", () => {
    const { result } = renderHook(() => [useCollapsed("d1"), useCollapsed("d2"), useCollapsed(null)])
    expect(result.current).toEqual([false, false, false])
    act(() => writeCollapsed("d1", true))
    expect(result.current).toEqual([true, false, false])
    expect(parseIds(window.localStorage.getItem(COLLAPSED_KEY))).toEqual(["d1"])
    act(() => writeCollapsed("d1", false))
    expect(result.current).toEqual([false, false, false])
  })

  it("keeps closing apart from collapsing", () => {
    const { result } = renderHook(() => [useClosed("d1"), useCollapsed("d1")])
    act(() => writeClosed("d1", true))
    expect(result.current).toEqual([true, false])
    expect(parseIds(window.localStorage.getItem(CLOSED_KEY))).toEqual(["d1"])
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBeNull()
    act(() => writeClosed("d1", false))
    expect(result.current).toEqual([false, false])
  })
})
