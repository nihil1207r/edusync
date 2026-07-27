/**
 * Ties "am I logged in" to the current browser TAB rather than the browser
 * as a whole.
 *
 * The server session lives in an httpOnly cookie (see api.ts / auth.go).
 * Cookies aren't tab-scoped — they survive closing a tab, and some browsers
 * even keep session cookies alive across "reopen closed tab" / restore-
 * previous-session, which makes a login feel "remembered" after the tab
 * that created it is gone.
 *
 * sessionStorage, by contrast, is genuinely scoped to a single tab: it
 * persists across reloads/navigation within that tab, but is wiped the
 * moment the tab closes and is never shared with a new tab. We use it purely
 * as a marker — "this tab is the one that logged in" — and treat its
 * absence as "not logged in," even if a stale session cookie is still
 * sitting in the browser.
 */

const FLAG_KEY = "edunexus:session-active";

export function markSessionActive() {
  try {
    sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    // sessionStorage can throw in some locked-down/private-browsing modes —
    // fail open rather than crash the login flow; worst case the tab-close
    // logout behavior just doesn't apply for that browser.
  }
}

export function hasActiveTabSession(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSessionActive() {
  try {
    sessionStorage.removeItem(FLAG_KEY);
  } catch {
    // ignore
  }
}
