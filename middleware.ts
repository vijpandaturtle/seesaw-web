/**
 * Read-only by default; writes need a key.
 *
 * The dashboard is public so it can be linked to, but queueing a job spends
 * real Anthropic credit and GPU time, and deleting one destroys a research
 * record. So anything that reads is open and anything that changes state is
 * not.
 *
 * Set WRITE_KEY to lock writes. Unset (local development) everything is
 * allowed, so running against your own machine is unchanged.
 *
 * Two ways to hold the key: visit ?key=… once to store a cookie, or send an
 * x-seesaw-key header (for curl and scripts).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "seesaw_write";
const HEADER = "x-seesaw-key";

/** Methods that only read. Everything else changes the job store. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(request: NextRequest) {
  const expected = process.env.WRITE_KEY;
  const { searchParams } = request.nextUrl;

  // ?key=… stores the cookie, then reloads without it in the URL. Handled
  // before the method check so the link works on a normal page visit.
  if (expected && searchParams.get("key") === expected) {
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

  if (!expected || SAFE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const holdsKey =
    request.cookies.get(COOKIE)?.value === expected ||
    request.headers.get(HEADER) === expected;

  if (holdsKey) return NextResponse.next();

  return NextResponse.json(
    {
      error:
        "This dashboard is read-only. Running a job spends real API and GPU " +
        "credit, so creating, approving, cancelling, and deleting need a key.",
    },
    { status: 403 },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
