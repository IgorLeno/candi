import { NextResponse, type NextRequest } from "next/server"
import { isLoopbackHost } from "@/lib/auth/local"

// No login: every request except Next's build assets and files in `public/` must be addressed to this machine
// (`localhost`, `127.0.0.1` or `[::1]`, any port). Anything else gets 403, pages and API alike. Server-side code
// checks again (`isLocalRequest()`): the proxy is not the only gate.
export function proxy(request: NextRequest): Response {
  if (isLoopbackHost(request.headers.get("host"))) return NextResponse.next()
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
}
