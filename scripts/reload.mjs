import { execFileSync } from "node:child_process";

export const OBSIDIAN = "/opt/homebrew/bin/obsidian";

// The theme files are symlinked from this repo into the vault. Obsidian's file
// watcher does not fire for symlinks and customCss keeps a per-path cache, so
// loadTheme() alone re-applies the stale copy. Clearing the cache first is the
// only call sequence that actually re-reads from disk.
export function reload() {
  const code =
    '(async()=>{app.customCss.csscache.clear();' +
    'await app.customCss.loadTheme();' +
    'await new Promise(r=>setTimeout(r,400));return JSON.stringify("ok")})()';
  return execFileSync(OBSIDIAN, ["eval", `code=${code}`], {
    encoding: "utf8",
    timeout: 30_000,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(reload());
}
