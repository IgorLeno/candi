import "server-only"
import { headers } from "next/headers"
import { isLoopbackHost } from "@/lib/auth/local"

/**
 * Server-side check, independent of `proxy.ts`: the dashboard layout, server actions, route handlers and the
 * Sheet read call it themselves, so a request that ever bypassed the proxy is still refused.
 */
export async function isLocalRequest(): Promise<boolean> {
  return isLoopbackHost((await headers()).get("host"))
}
