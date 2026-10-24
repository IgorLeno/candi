/**
 * The panel has no login: it runs on the owner's machine and answers only requests addressed to it by a
 * loopback name, on any port. Kept free of Next imports so the rule is unit-tested directly.
 *
 * Checking the `Host` header (and not only binding the server to 127.0.0.1) also refuses DNS rebinding: a page
 * on another site that resolves its own name to 127.0.0.1 still sends that name as the host.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

export function isLoopbackHost(host: unknown): boolean {
  if (typeof host !== "string") return false
  const match = /^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase())
  return match !== null && LOOPBACK_HOSTNAMES.has(match[1])
}
