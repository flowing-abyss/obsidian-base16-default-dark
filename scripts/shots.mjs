import { mkdir } from "node:fs/promises";
import { readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { OBSIDIAN, reload } from "./reload.mjs";

const NOTE = "base/notes/test syntax.md";
const BASES_FILE = "home/databases/recent.base";

// Shared in-page helpers, inlined at the top of every eval'd snippet below.
// __settle polls a scroll position across double-requestAnimationFrame
// until it has been unchanged for several consecutive frames, instead of
// trusting a fixed sleep to have been long enough - the margin on a fixed
// sleep shrinks as the document grows, so it silently gets racier over
// time. It throws on timeout rather than returning early, so a frame that
// never settles fails the run instead of producing a screenshot mid-scroll.
// __waitFor polls an arbitrary condition (e.g. "does this DOM node exist
// yet") the same way, for cases where nothing scrolls but something still
// needs to mount (a modal, a windowed-renderer heading, Bases' table body).
const HELPERS = `
  async function __settle(getTop, {stableFrames=6, timeoutMs=6000}={}) {
    const t0 = performance.now();
    let last = null, stable = 0;
    while (true) {
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const cur = getTop();
      if (cur === last) {
        stable++;
        if (stable >= stableFrames) return cur;
      } else {
        stable = 0;
        last = cur;
      }
      if (performance.now() - t0 > timeoutMs) {
        throw new Error("scroll did not settle within " + timeoutMs + "ms (stuck at " + cur + ")");
      }
    }
  }
  async function __waitFor(check, {timeoutMs=6000, intervalMs=30}={}) {
    const t0 = performance.now();
    while (true) {
      const v = check();
      if (v) return v;
      if (performance.now() - t0 > timeoutMs) {
        throw new Error("condition did not become true within " + timeoutMs + "ms");
      }
      await new Promise(r=>setTimeout(r, intervalMs));
    }
  }
`;

// Scroll the test note to the first line matching `anchor`. The note is the
// project's syntax fixture, so every markdown frame is an anchor into it.
const at = (anchor) => `(async()=>{
  ${HELPERS}
  await document.fonts.ready;
  const f=app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)});
  const leaf=app.workspace.getLeaf(false);
  await leaf.openFile(f,{state:{mode:"source",source:false}});
  const v=leaf.view;
  const lines=v.editor.getValue().split("\\n");
  const n=lines.findIndex(l=>l.startsWith(${JSON.stringify(anchor)}));
  if(n<0) throw new Error("anchor not found: "+${JSON.stringify(anchor)});
  v.editor.scrollIntoView({from:{line:n,ch:0},to:{line:n,ch:0}},true);
  // This vault runs vim mode, whose normal-mode block cursor is drawn by its
  // own overlay independent of DOM focus - editor.blur() does not hide it.
  // Park the caret on whichever document end is farther from the anchor
  // instead, so it lands off-screen. editor.setCursor() itself would scroll
  // the view back to reveal the new cursor line, undoing the scroll above -
  // dispatching the selection change directly on the underlying CodeMirror
  // instance moves the caret without any implicit scrollIntoView.
  const total=lines.length;
  const farLine = n<total/2 ? total-1 : 0;
  const off=v.editor.posToOffset({line:farLine,ch:0});
  v.editor.cm.dispatch({selection:{anchor:off}});
  const scroller = v.editor.cm.scrollDOM;
  await __settle(()=>scroller.scrollTop);
  // Prove the anchor is actually where the frame claims it is, not caught
  // mid-flight: CM6's coordsAtPos gives the anchor line's viewport
  // position, which must land inside the scroller's visible box once
  // settled.
  const anchorOffset = v.editor.posToOffset({line:n,ch:0});
  const coords = v.editor.cm.coordsAtPos(anchorOffset);
  if (!coords) throw new Error("anchor line has no coords after settle (line "+n+")");
  const scrollerBox = scroller.getBoundingClientRect();
  const top = coords.top - scrollerBox.top;
  if (top < -1 || top > scroller.clientHeight) {
    throw new Error("anchor not in view after settle: top="+top+" viewport="+scroller.clientHeight);
  }
  return JSON.stringify("ok");})()`;

// Reading view in this vault is windowed: only headings near the current
// scroll position exist in the DOM, so querying contentEl for h1/h2/h3 misses
// anchors outside that window. Scroll by line via previewMode.applyScroll()
// (using the heading's line from metadataCache) instead - that's the same
// call Obsidian's own outline/TOC uses, and it renders the target window.
const reading = (anchor) => `(async()=>{
  ${HELPERS}
  await document.fonts.ready;
  const f=app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)});
  const leaf=app.workspace.getLeaf(false);
  await leaf.openFile(f,{state:{mode:"preview"}});
  // applyScroll's line->offset map isn't reliable until the preview has had
  // one paint cycle after openFile - calling it synchronously right away
  // observably scrolls to a stale/wrong position (reproduced: it lands near
  // the end of the document instead of the requested line). This waits on
  // the browser's own paint scheduling, not a guessed duration.
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const cache=app.metadataCache.getFileCache(f);
  const h=(cache.headings||[]).find(x=>x.heading===${JSON.stringify(anchor)});
  if(!h) throw new Error("reading anchor not found: "+${JSON.stringify(anchor)});
  const contentEl = leaf.view.contentEl;
  const findHeading = () => {
    const els = contentEl.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (const el of els) if (el.textContent.trim()===${JSON.stringify(anchor)}) return el;
    return null;
  };
  // applyScroll's target can still be stale on the first call (observed:
  // the windowed renderer occasionally keeps whatever window it had before
  // this call, so the target heading never mounts). Re-issue it on every
  // poll instead of trusting a single call, so a stale first attempt
  // self-heals instead of waiting out the full timeout and failing.
  const t0 = performance.now();
  let headingEl = null;
  while (!headingEl) {
    leaf.view.previewMode.applyScroll(h.position.start.line);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    headingEl = findHeading();
    if (!headingEl && performance.now() - t0 > 6000) {
      throw new Error("condition did not become true within 6000ms");
    }
  }
  const scroller = contentEl.querySelector(".markdown-preview-view") || contentEl;
  await __settle(()=>scroller.scrollTop);
  // Re-find after settling: the windowed renderer can swap DOM nodes out
  // from under a stale reference while the scroll position is still moving.
  headingEl = await __waitFor(findHeading);
  const rect = headingEl.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const top = rect.top - scrollerBox.top;
  if (top < -1 || top > scroller.clientHeight) {
    throw new Error("reading anchor not in view after settle: top="+top+" viewport="+scroller.clientHeight);
  }
  return JSON.stringify("ok");})()`;

const cmd = (id) => `(async()=>{
  ${HELPERS}
  await document.fonts.ready;
  app.commands.executeCommandById(${JSON.stringify(id)});
  await new Promise(r=>setTimeout(r,800));return JSON.stringify("ok");})()`;

// Opens an existing Bases view from the vault (not the syntax fixture -
// Bases views are file-backed queries, not something that fits in a single
// markdown note) so src/50-plugins/bases.css has a frame at all.
const bases = (path) => `(async()=>{
  ${HELPERS}
  await document.fonts.ready;
  const f=app.vault.getAbstractFileByPath(${JSON.stringify(path)});
  if(!f) throw new Error("bases file not found: "+${JSON.stringify(path)});
  const leaf=app.workspace.getLeaf(false);
  await leaf.openFile(f);
  const contentEl = leaf.view.containerEl;
  await __waitFor(()=>contentEl.querySelector(".bases-table-container, .bases-view"));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,150));
  return JSON.stringify("ok");})()`;

// Verified against the fixture's actual headings (grep -n '^#' "test syntax.md").
// "Заголовки" is an H1 ("# Заголовки"), not H2 - every other anchor below is H2.
const FRAMES = [
  { name: "01-headings", setup: at("# Заголовки") },
  { name: "02-text", setup: at("## Текст") },
  { name: "03-links", setup: at("## Ссылки") },
  { name: "04-embed", setup: at("## Встраивание") },
  { name: "05-quote", setup: at("## Цитата") },
  { name: "06-lists", setup: at("## Списки") },
  { name: "07-tasks", setup: at("## Задачи") },
  { name: "08-tags", setup: at("## Теги") },
  { name: "09-separators", setup: at("## Разделители") },
  { name: "10-callouts", setup: at("## Callouts") },
  { name: "11-callouts-collapsible", setup: at("## Сворачиваемые Callouts") },
  { name: "12-callouts-title", setup: at("## Callout с заголовком") },
  { name: "13-table", setup: at("## Таблица") },
  { name: "14-code", setup: at("## Код") },
  { name: "15-math", setup: at("## Формулы") },
  { name: "16-mermaid", setup: at("## Mermaid") },
  { name: "17-footnotes", setup: at("## Сноски") },
  { name: "18-html", setup: at("## HTML") },
  { name: "19-mixed-content", setup: at("## Смешанный контент") },
  { name: "20-mini-card", setup: at("## Мини-карточка проекта") },
  { name: "21-formatting-combinations", setup: at("## Комбинации форматирования") },
  { name: "22-dashboard", setup: at("## Псевдо-дашборд") },
  { name: "30-reading-headings", setup: reading("Заголовки") },
  { name: "31-reading-code", setup: reading("Код") },
  { name: "32-reading-callouts", setup: reading("Callouts") },
  { name: "33-bases", setup: bases(BASES_FILE) },
  // This vault has the core switcher/global-search/command-palette plugins
  // disabled in favor of community replacements (verified via
  // app.internalPlugins.plugins[...].enabled === false for all three) - the
  // brief's "switcher:open"/"global-search:open"/"app:open-settings" command
  // IDs either don't exist or silently no-op here. Use the commands that
  // actually render a modal in this vault instead (confirmed by checking
  // document.querySelectorAll(".modal-container,.prompt").length before/after).
  // "app:open-settings" was dropped entirely: it tears settings out into a
  // separate native OS window in this install (confirmed via
  // electron.remote.BrowserWindow.getAllWindows()), which `obsidian
  // dev:screenshot` cannot capture.
  { name: "40-command-palette", setup: cmd("obsidian-another-quick-switcher:command-palette") },
  { name: "41-file-search", setup: cmd("obsidian-another-quick-switcher:search-command_file-search") },
  // Core switcher/global-search internal plugins were re-enabled by the user
  // after the baseline capture above was designed (they were disabled then,
  // which is why every other UI-chrome frame targets a community
  // replacement instead). Placed last: global-search:open renders into the
  // already-visible sidebar rather than a modal, so unlike the other frames
  // teardown does not restore the sidebar's previously-active tab - keeping
  // these two frames last means no later frame's screenshot is affected by
  // that leftover state.
  { name: "42-quick-switcher", setup: cmd("switcher:open") },
  { name: "43-global-search", setup: cmd("global-search:open") },
];

const TEARDOWN = `(async()=>{
  document.dispatchEvent(new KeyboardEvent("keydown",
    {key:"Escape",code:"Escape",bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  const f=app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)});
  await app.workspace.getLeaf(false).openFile(f,
    {state:{mode:"source",source:false}});
  await new Promise(r=>setTimeout(r,400));
  return JSON.stringify({
    modals: document.querySelectorAll(".modal-container,.prompt").length,
    active: app.workspace.getActiveFile()?.path ?? null});})()`;

// `obsidian eval` prints "=> <value>" where <value> is whatever the JS handed
// back, unquoted. Every snippet above JSON.stringify()s its return value, so
// the text after "=> " is always valid JSON - that's the contract this parser
// relies on. If a snippet throws, the CLI prints "Error: <message>" instead
// (still exit code 0), which fails the "=> " match below and is surfaced as a
// loud error rather than silently treated as success.
function parseEvalOutput(raw) {
  const trimmed = raw.trimEnd();
  const m = trimmed.match(/^=>\s*([\s\S]*)$/);
  if (!m) {
    throw new Error(`obsidian eval did not return a value:\n${raw}`);
  }
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`obsidian eval output was not valid JSON: ${m[1]}\n(${e.message})`);
  }
}

// The obsidian CLI has been observed to hang after finishing its work (the
// dev:screenshot subprocess wrote its file, then never exited). A bounded
// timeout turns that into a loud, actionable failure instead of an
// indefinite hang. killSignal must be SIGKILL: this Electron-based binary
// does not exit on SIGTERM (confirmed empirically - a SIGTERM-only timeout
// left the child alive and execFileSync blocked well past the deadline,
// since it waits for the child to actually exit before returning).
const CLI_TIMEOUT_MS = 30_000;
const CLI_OPTS = { timeout: CLI_TIMEOUT_MS, killSignal: "SIGKILL" };

function ev(code) {
  const raw = execFileSync(OBSIDIAN, ["eval", `code=${code}`], { ...CLI_OPTS, encoding: "utf8" });
  return parseEvalOutput(raw);
}

function screenshot(path) {
  execFileSync(OBSIDIAN, ["dev:screenshot", `path=${path}`], CLI_OPTS);
}

// In-page settle checks (above) cover everything that happens inside the
// renderer, but `dev:screenshot` is a separate OS process launched after
// `eval` returns - a genuinely settled page can still be mid-frame of a CSS
// transition/animation that no in-page wait could see coming. Capture twice
// and compare bytes: if a frame is truly settled the two captures are
// identical; if they differ, the page was still moving, so retry once and
// then fail loudly rather than accept a possibly-bad PNG.
function captureSettled(finalPath) {
  const tmpA = `${tmpdir()}/shots-${process.pid}-a.png`;
  const tmpB = `${tmpdir()}/shots-${process.pid}-b.png`;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      screenshot(tmpA);
      screenshot(tmpB);
      if (readFileSync(tmpA).equals(readFileSync(tmpB))) {
        renameSync(tmpB, finalPath);
        return;
      }
      console.error(
        `  frame still moving (two captures differ), ${attempt === 1 ? "retrying once" : "giving up"}...`
      );
    }
    throw new Error(`frame never settled across two capture attempts: ${finalPath}`);
  } finally {
    rmSync(tmpA, { force: true });
    rmSync(tmpB, { force: true });
  }
}

const label = process.argv[2];
if (!label) throw new Error("usage: npm run shots -- <label>");
const dir = `.docs/shots/${label}`;
await mkdir(dir, { recursive: true });

reload();
for (const f of FRAMES) {
  try {
    ev(f.setup);
    captureSettled(`${process.cwd()}/${dir}/${f.name}.png`);
  } finally {
    // Obsidian is a live, human-owned workspace. If setup or the screenshot
    // throws (bad anchor, a settle timeout, or the documented intermittent
    // CLI hang getting SIGKILLed at the timeout), teardown must still run so
    // a stray modal or a mid-scroll editor is never left behind. Best-effort:
    // if teardown itself throws, swallow that secondary error and let the
    // original failure (if any) propagate - a broken teardown must not mask
    // the real cause.
    try {
      ev(TEARDOWN);
    } catch (teardownErr) {
      console.error(`teardown after ${f.name} also failed: ${teardownErr.message}`);
    }
  }
  console.log(`captured ${f.name}`);
}

const { modals, active } = ev(TEARDOWN);
if (modals !== 0) {
  console.error(`TEARDOWN FAILED: ${modals} modal(s) left open`);
  process.exit(1);
}
if (active !== NOTE) {
  console.error(`TEARDOWN FAILED: active file is ${active}, expected ${NOTE}`);
  process.exit(1);
}
console.log(`\n${FRAMES.length} frames -> ${dir}, workspace restored`);
