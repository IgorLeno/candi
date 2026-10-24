import { describe, expect, it } from "vitest"
import { isLoopbackHost } from "@/lib/auth/local"

describe("isLoopbackHost", () => {
  it("accepts loopback names on any port", () => {
    for (const host of ["localhost", "localhost:3000", "localhost:3001", "LOCALHOST:3002", "127.0.0.1:3000"]) {
      expect(isLoopbackHost(host)).toBe(true)
    }
    expect(isLoopbackHost("127.0.0.1")).toBe(true)
    expect(isLoopbackHost("[::1]:3001")).toBe(true)
    expect(isLoopbackHost("[::1]")).toBe(true)
  })

  it("refuses network addresses and other names, including rebinding and look-alikes", () => {
    for (const host of [
      "192.168.31.186:3001",
      "0.0.0.0:3000",
      "evil.example",
      "evil.example:3000",
      "localhost.evil.example",
      "127.0.0.1.nip.io:3000",
      "localhost.",
      "localhost:3000:1",
      "user@localhost:3000",
      "[::ffff:192.168.0.1]:3000",
      "",
      "  ",
    ]) {
      expect(isLoopbackHost(host)).toBe(false)
    }
    expect(isLoopbackHost(null)).toBe(false)
    expect(isLoopbackHost(undefined)).toBe(false)
  })
})
