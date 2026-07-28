/**
 * Password gate for the whole dashboard.
 *
 * This app can queue research jobs, and those spend real Anthropic and GPU
 * credit — so a public URL is an open tab on someone else's account. Vercel's
 * own password protection is a paid feature; this is the plan-independent
 * equivalent.
 *
 * Set SITE_PASSWORD to enable it. Unset (local development) it lets
 * everything through, so nothing changes when running against your own
 * machine.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "seesaw_auth";

export function middleware(request: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;

  // The login page itself, and Next's own assets, must stay reachable.
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (request.cookies.get(COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  // ?key=… sets the cookie once, so a link can carry the password.
  if (searchParams.get("key") === expected) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("key");
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE, expected, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  // Basic auth so a browser prompts, and curl can pass -u.
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) {
      const response = NextResponse.next();
      response.cookies.set(COOKIE, expected, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Seesaw"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
