import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { OBSIDIAN, reload } from "./reload.mjs";

const NOTE = "base/notes/test syntax.md";

// Scroll the test note to the first line matching `anchor`. The note is the
// project's syntax fixture, so every markdown frame is an anchor into it.
const at = (anchor) => `(async()=>{
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
  await new Promise(r=>setTimeout(r,700));
  return JSON.stringify("ok");})()`;

// Reading view in this vault is windowed: only headings near the current
// scroll position exist in the DOM, so querying contentEl for h1/h2/h3 misses
// anchors outside that window. Scroll by line via previewMode.applyScroll()
// (using the heading's line from metadataCache) instead - that's the same
// call Obsidian's own outline/TOC uses, and it renders the target window.
const reading = (anchor) => `(async()=>{
  const f=app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)});
  const leaf=app.workspace.getLeaf(false);
  await leaf.openFile(f,{state:{mode:"preview"}});
  await new Promise(r=>setTimeout(r,500));
  const cache=app.metadataCache.getFileCache(f);
  const h=(cache.headings||[]).find(x=>x.heading===${JSON.stringify(anchor)});
  if(!h) throw new Error("reading anchor not found: "+${JSON.stringify(anchor)});
  leaf.view.previewMode.applyScroll(h.position.start.line);
  await new Promise(r=>setTimeout(r,700));
  return JSON.stringify("ok");})()`;

const cmd = (id) => `(async()=>{
  app.commands.executeCommandById(${JSON.stringify(id)});
  await new Promise(r=>setTimeout(r,800));return JSON.stringify("ok");})()`;

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

const label = process.argv[2];
if (!label) throw new Error("usage: npm run shots -- <label>");
const dir = `.docs/shots/${label}`;
await mkdir(dir, { recursive: true });

reload();
for (const f of FRAMES) {
  try {
    ev(f.setup);
    screenshot(`${process.cwd()}/${dir}/${f.name}.png`);
  } finally {
    // Obsidian is a live, human-owned workspace. If setup or the screenshot
    // throws (bad anchor, or the documented intermittent CLI hang getting
    // SIGKILLed at the timeout), teardown must still run so a stray modal or
    // a mid-scroll editor is never left behind. Best-effort: if teardown
    // itself throws, swallow that secondary error and let the original
    // failure (if any) propagate - a broken teardown must not mask the real
    // cause.
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
