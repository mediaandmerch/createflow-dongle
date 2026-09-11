// Update check: the newest release on GitHub against the running version. Same logic as in
// createflow (apps/desktop/src/shared/update.ts); the two repositories share no package.
import type { UpdateInfo } from "./ipc.js";

/** "v0.2.1" or "0.2.1" → [0, 2, 1]; null for anything else, pre-releases like "0.3.0-beta" included. */
function parts(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true when `latest` is a higher version than `current`; false when either can't be read. */
export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest), b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** GitHub's "latest release" reply → version and release page; null when it isn't one. The page
 *  is opened in the browser, so only a github.com link is taken. */
export function parseLatestRelease(json: unknown): UpdateInfo | null {
  if (!json || typeof json !== "object") return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
  if (typeof r.tag_name !== "string" || typeof r.html_url !== "string" || r.draft || r.prerelease) return null;
  if (!parts(r.tag_name) || !r.html_url.startsWith("https://github.com/")) return null;
  return { version: r.tag_name.replace(/^v/, ""), url: r.html_url };
}
