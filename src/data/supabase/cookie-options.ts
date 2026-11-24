/**
 * Persistent auth cookies for desktop, mobile browser, and installed PWA.
 * Session ends only on explicit logout (or refresh-token revocation).
 * ~400 days matches common browser hard caps for Max-Age.
 */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
}
