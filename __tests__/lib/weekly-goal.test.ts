import { describe, expect, it } from "vitest"
import { DEFAULT_WEEKLY_GOAL, parseWeeklyGoal } from "@/lib/weekly-goal"

describe("parseWeeklyGoal", () => {
  it("accepts integers from 1 to 30", () => {
    expect(parseWeeklyGoal("1")).toBe(1)
    expect(parseWeeklyGoal("12")).toBe(12)
    expect(parseWeeklyGoal("30")).toBe(30)
  })

  it("falls back to the default for missing or out-of-range values", () => {
    for (const raw of [null, "", "0", "31", "2.5", "-3", "abc"]) {
      expect(parseWeeklyGoal(raw)).toBe(DEFAULT_WEEKLY_GOAL)
    }
  })
})
