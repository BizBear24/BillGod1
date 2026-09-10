import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "billgod_session";

const PROTECTED_PREFIXES = ["/dashboard", "/setup", "/settings", "/billing", "/purchase", "/inventory", "/masters", "/customers", "/suppliers", "/accounting", "/reports", "/barcodes", "/loyalty", "/communications"];

/**
 * Cheap cookie-presence gate only — real session validation (DB-backed,
 * revocable) happens server-side in layouts via getSessionUser(). Kept out
 * of the database so it stays compatible with the Edge runtime.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/setup/:path*", "/settings/:path*", "/billing/:path*", "/purchase/:path*", "/inventory/:path*", "/masters/:path*", "/customers/:path*", "/suppliers/:path*", "/accounting/:path*", "/reports/:path*", "/barcodes/:path*", "/loyalty/:path*", "/communications/:path*"],
};
