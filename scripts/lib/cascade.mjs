// Shared parsing/specificity primitives for scripts/check-cascade.mjs.
//
// This does NOT reuse scripts/lib/css.mjs's normalize()/splitTopLevelBlocks()
// because cascade analysis needs per-declaration data (individual selectors
// in a comma list, individual property/value/!important triples) rather than
// whole-block text. It reimplements the same comment/string-aware depth walk
// scripts/inventory.mjs and scripts/lib/css.mjs use, for the same reason
// documented there: a commented-out selector's stray "{" must not desync
// brace counting.

// Splits a string on top-level commas (not inside (), [], or quotes).
export function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0;
  let cursor = 0;
  let inString = false;
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(s.slice(cursor, i));
      cursor = i + 1;
    }
  }
  parts.push(s.slice(cursor));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// CSS specificity per the Selectors spec, as [ids, classes, types]:
//   - #id                                     -> ids++
//   - .class, [attr], simple pseudo-class      -> classes++
//   - type selector, ::pseudo-element          -> types++
//   - :not()/:is()/:has() (and legacy :matches)-> specificity of the most
//     specific complex selector in the argument list (NOT an additional
//     classes++ on top)
//   - :where()                                 -> contributes nothing
//   - combinators (space > + ~), *             -> contribute nothing
// Good enough for this theme's selector vocabulary (verified against every
// pseudo-class/element actually used in the codebase); not a full CSS
// parser (no namespace prefixes, no escaped-character edge cases).
export function specificity(selector) {
  let a = 0,
    b = 0,
    c = 0;
  const s = selector;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "#") {
      const m = /^#[-\w\\]+/.exec(s.slice(i));
      i += m ? m[0].length : 1;
      a++;
      continue;
    }
    if (ch === ".") {
      const m = /^\.[-\w\\]+/.exec(s.slice(i));
      i += m ? m[0].length : 1;
      b++;
      continue;
    }
    if (ch === "[") {
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === "[") depth++;
        else if (s[j] === "]") depth--;
        j++;
      }
      i = j;
      b++;
      continue;
    }
    if (ch === ":") {
      if (s[i + 1] === ":") {
        const m = /^::[-\w]+/.exec(s.slice(i));
        i += m ? m[0].length : 2;
        c++;
        continue;
      }
      const m = /^:([-\w]+)/.exec(s.slice(i));
      if (!m) {
        i++;
        continue;
      }
      const name = m[1].toLowerCase();
      let consumed = m[0].length;
      let functional = null;
      if (s[i + consumed] === "(") {
        let depth = 1;
        let j = i + consumed + 1;
        const argStart = j;
        while (j < s.length && depth > 0) {
          if (s[j] === "(") depth++;
          else if (s[j] === ")") depth--;
          j++;
        }
        const argText = s.slice(argStart, j - 1);
        consumed = j - i;
        if (["not", "is", "matches", "has"].includes(name)) {
          let max = [0, 0, 0];
          for (const arg of splitTopLevelCommas(argText)) {
            const sp = specificity(arg);
            if (compareSpecificity(sp, max) > 0) max = sp;
          }
          functional = max;
        } else if (name === "where") {
          functional = [0, 0, 0];
        }
      }
      i += consumed;
      if (functional) {
        a += functional[0];
        b += functional[1];
        c += functional[2];
      } else {
        b++;
      }
      continue;
    }
    if (ch === "*" || /[\s>+~]/.test(ch)) {
      i++;
      continue;
    }
    const m = /^[-\w\\]+/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      c++;
      continue;
    }
    i++;
  }
  return [a, b, c];
}

export function compareSpecificity(x, y) {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
export function specKey(sp) {
  return sp.join(",");
}

// Parses a declaration block body ("prop: value; prop2: value2 !important;")
// into {prop, value, important} triples. Splits on top-level ";" only.
export function parseDeclarations(body) {
  const decls = [];
  for (const raw of splitTopLevelSemicolons(body)) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const colon = findTopLevelColon(stmt);
    if (colon < 0) continue; // not a declaration (stray token)
    const prop = stmt.slice(0, colon).trim().toLowerCase();
    let value = stmt.slice(colon + 1).trim();
    const importantMatch = /!\s*important\s*$/i.exec(value);
    const important = !!importantMatch;
    if (important) value = value.slice(0, importantMatch.index).trim();
    decls.push({ prop, value: value.toLowerCase().replace(/\s+/g, " "), important });
  }
  return decls;
}

function splitTopLevelSemicolons(s) {
  const parts = [];
  let depth = 0;
  let cursor = 0;
  let inString = false;
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) {
      parts.push(s.slice(cursor, i));
      cursor = i + 1;
    }
  }
  parts.push(s.slice(cursor));
  return parts;
}

function findTopLevelColon(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

// Comment/string-aware top-level block walker over RAW (not normalize()d)
// CSS text. Returns blocks in file order with their raw selector text, raw
// body text, and the source line their opening "{" is on. No @media/nested
// at-rules exist in this codebase (verified: baseline-3.7.23 theme.css has
// none), so every top-level block is a plain "selector-list { decls }" rule.
export function parseBlocks(src) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let line = 1;
  let startLine = 1;
  let state = "normal";
  let stringQuote = "";
  let selectorStart = 0;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") line++;

    if (state === "comment") {
      if (c === "*" && src[i + 1] === "/") {
        state = "normal";
        i++;
      }
      continue;
    }
    if (state === "string") {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === stringQuote) state = "normal";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      state = "comment";
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      state = "string";
      stringQuote = c;
      continue;
    }
    if (c === "{") {
      if (depth === 0) {
        startLine = line;
        start = i;
      }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const rawSelector = src.slice(selectorStart, start).split(/}|\*\//).pop();
        const body = src.slice(start + 1, i);
        blocks.push({
          line: startLine,
          selectorText: rawSelector.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
          body,
        });
        selectorStart = i + 1;
      }
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Bulk categorical dismissal rules for scripts/check-cascade.mjs.
//
// A "candidate pair" is two declarations (one earlier, one later in the
// legacy cascade) that set the same property with equal specificity,
// differing values, and matching !important — the only shape in which the
// split's reordering can flip which one wins (see check-cascade.mjs for how
// candidates are computed). Most candidates are still not a real risk,
// because their two selectors can never match the very same DOM element:
// Obsidian composes its UI out of self-contained components (a modal, a
// sidebar pane, a plugin's own widget, a CodeMirror line-type class, a
// Prism-highlighted span) and never assigns two different components'
// "owning" marker classes to one shared node. Each rule below states ONE
// piece of that architectural knowledge and applies it to every matching
// candidate, rather than re-deriving the same reasoning pair by pair.
//
// This is deliberately conservative in one direction only: a rule fires iff
// EVERY selector on the applicable side carries the marker (see everySel),
// so a block with a mixed comma-list only gets dismissed if its entire
// selector list is inside the marked territory.
function everySel(sels, re) {
  return sels.every((s) => re.test(s));
}
function someSel(sels, re) {
  return sels.some((s) => re.test(s));
}

// Rightmost compound's bare tag name, e.g. "pre.foo" -> "pre"; ".foo" (no
// leading tag) -> null (any tag). Two selectors whose rightmost compounds
// both name a concrete, DIFFERENT tag can never match the same element -
// an element has exactly one tag name.
function rightmostTag(sel) {
  const compounds = sel.trim().split(/\s+/);
  const last = compounds[compounds.length - 1];
  if (last.match(/^[.#[:*]/)) return null;
  const m = /^[a-zA-Z][-a-zA-Z0-9]*/.exec(last.replace(/^[>+~]/, ""));
  return m ? m[0].toLowerCase() : null;
}

// Reading View (Markdown rendered to HTML, code blocks highlighted by
// Prism.js: `.token.*`, `[class*="language-"]`) and Live Preview/Source
// mode (CodeMirror 6, syntax classes `.cm-*`/`.HyperMD-*`) are two entirely
// separate DOM subtrees for a given note - Obsidian renders a note in
// exactly one of the two at a time, and even with split panes the two
// subtrees never nest inside each other.
const READING_MARK =
  /\.markdown-preview-view|\.markdown-rendered|\.token\.|\[class\*=.language-|\.language-css|\.frontmatter\.language-|\.style\b/;
const EDITING_MARK = /\.markdown-source-view|\.cm-s-obsidian|\bmod-cm6\b|\.cm-[a-z]|\.hypermd-/i;

// Obsidian's Menu class (right-click context menus, the `.menu`/
// `.menu-scroll` classes) always mounts by appending its DOM node directly
// to `activeDocument.body` (verified in app.js's Menu.prototype.showAtPosition:
// `i = (t = t || activeDocument).body; ...; i.appendChild(l)`) - never as a
// descendant of a `.prompt`/`.modal` overlay, even when opened while one is
// showing.
const MENU_MARK = /\.menu-scroll|\.menu\b|\.suggestion-container/;
const PROMPT_MARK = /\.prompt\b|\.modal\b/;
// Obsidian's Modal class (core Modal.open(), which plugin modals like
// Metadata Menu's field editor build on) likewise appends its containerEl
// directly to document.body - a modal overlay is never a descendant of a
// `.workspace-leaf-content` pane, and a workspace leaf's content is never
// inside a modal.
const MAIN_LEAF_MARK = /\bworkspace-leaf-content\[data-type=.markdown.\]/;

// A .cm-line receives exactly one markdown line-type class from CM6's
// mode (HyperMD-codeblock / HyperMD-header-N / HyperMD-quote-N /
// HyperMD-list-line-N / plain) - verified live and via source: these are
// mutually exclusive per line, and content inside a fenced code block is
// not reparsed for heading/emphasis/list syntax.
const LINE_TYPE = /\.hypermd-|\.cm-line\.hypermd-/i;
// Nested SPAN-level marks within a line's content - never the same DOM
// node as the line's own .cm-line div.
const SPAN_MARK = /\.cm-inline-code|\.cm-strong|\.cm-em|\.cm-formatting-list|\.cm-formatting/i;
// Ancestor/sibling *container* elements Obsidian's widgets create around or
// near a line - never the .cm-line element itself.
const LINE_ADJACENT_CONTAINER = /\.callout\b|\.callout-|\binline-title\b|\.popover\b|\.popover-/i;
const CALLOUT_MARK = /\.callout\b|\.callout-/i;
const TITLE_MARK = /inline-title/i;
const TOKEN_MARK = /\.token\./;

// Self-contained "owning component" marker classes: a plugin's own class
// prefix, or a core widget's container class. Verified against this vault's
// actual installed-plugin list and, for the ones the review flagged as
// highest-risk (search-pane classes, the Hybrid Search preview panel),
// against live DOM inspection - see task-4-report.md's cascade-check
// section for the specific checks performed. None of these component
// subtrees nests inside another one included here.
export const COMPONENT_ROOTS = [
  /\.contains-task-list\.plugin-tasks-query-result/, // Tasks plugin query block
  /\.another-quick-switcher__/, // Another Quick Switcher plugin
  /\.various-complements__/, // Various Complements plugin
  /\.mv-/, // Metadata Validator plugin
  /\.zoom-plugin-/, // Zoom plugin
  /\.multi-select-pill/, // metadata tag/multi-select pills
  /\.suggestion-highlight/, // fuzzy-match highlight span
  /\.card-id\b/, // Bases board card id
  /\bboard-/, // Bases/Kanban board chrome
  /\.popover\b|\.popover-|\.hover-popover\b/, // hover-preview popover chrome
  /\.metadata-menu\.modal-container/, // Metadata Menu plugin's own field-editor modal
  /\.field-btn-container|\.metadata-container|\.metadata-property/, // core property/frontmatter editor UI
  /\bworkspace-leaf-content\[data-type=.outline.\]/, // core Outline pane
  /\.math\.math-|\.mjx-tex|\.cm-math\b/i, // math-render targets
  /\.scrollcontainer/i, // AQS scroll container
  /\.cm-highlight\b/, // editor line-highlight decoration
  /\binline-embed\b|\bmarkdown-embed\b|\binternal-embed\b/, // note/file embeds
  /\.omnisearch-/, // Omnisearch plugin
  /\.bases-calendar/, // Bases plugin: Calendar sub-view
  /\.is-flashing\b/, // search-jump flash highlight
  /\.search-result-file-matched-text\b/,
  /\.cm-atom\.cm-hmd-frontmatter|\.frontmatter\.language-yaml/, // CM6 frontmatter (YAML) token region
  /^\.inline-title\b/, // the note-title element itself
  /::-webkit-scrollbar/, // scrollbar pseudo-elements
  /\.tree-item-self|\.search-result-file/, // core Search-pane row/match classes
  /\.hybrid-search-preview/, // Hybrid Search plugin's note-preview panel (verified live: never contains a Search-pane row)
  /\bbases-/, // Bases plugin (generic - kept last so more specific bases-* entries above win)
];

// Categorizes one candidate pair. Returns a short reason tag on dismissal,
// or null if none of the bulk rules apply - callers must then consult
// scripts/cascade-triage.mjs for an individually-reviewed verdict, and FAIL
// if there isn't one.
export function classifyCandidate(p) {
  const a = p.aSelectors;
  const b = p.bSelectors;

  const aTags = a.map(rightmostTag).filter(Boolean);
  const bTags = b.map(rightmostTag).filter(Boolean);
  const aHasWild = a.map(rightmostTag).some((t) => t === null);
  const bHasWild = b.map(rightmostTag).some((t) => t === null);
  if (aTags.length && bTags.length && !aHasWild && !bHasWild && !aTags.some((t) => bTags.includes(t))) {
    return "tag-mismatch";
  }

  if (
    (everySel(a, READING_MARK) && everySel(b, EDITING_MARK)) ||
    (everySel(a, EDITING_MARK) && everySel(b, READING_MARK))
  ) {
    return "reading-vs-editing-mode";
  }

  if ((everySel(a, MENU_MARK) && everySel(b, PROMPT_MARK)) || (everySel(a, PROMPT_MARK) && everySel(b, MENU_MARK))) {
    return "menu-vs-prompt";
  }

  if (
    (everySel(a, PROMPT_MARK) && everySel(b, MAIN_LEAF_MARK) && !someSel(a, MAIN_LEAF_MARK)) ||
    (everySel(b, PROMPT_MARK) && everySel(a, MAIN_LEAF_MARK) && !someSel(b, MAIN_LEAF_MARK))
  ) {
    return "modal-vs-main-leaf";
  }

  if (everySel(a, TOKEN_MARK) !== everySel(b, TOKEN_MARK) && (everySel(a, TOKEN_MARK) || everySel(b, TOKEN_MARK))) {
    return "prism-token-vs-other";
  }

  if (
    (everySel(a, LINE_TYPE) &&
      (everySel(b, LINE_ADJACENT_CONTAINER) || everySel(b, SPAN_MARK) || (everySel(b, LINE_TYPE) && a.join() !== b.join()))) ||
    (everySel(b, LINE_TYPE) &&
      (everySel(a, LINE_ADJACENT_CONTAINER) || everySel(a, SPAN_MARK) || (everySel(a, LINE_TYPE) && a.join() !== b.join())))
  ) {
    return "cm6-line-vs-adjacent";
  }
  if (
    (everySel(a, SPAN_MARK) && everySel(b, LINE_ADJACENT_CONTAINER)) ||
    (everySel(b, SPAN_MARK) && everySel(a, LINE_ADJACENT_CONTAINER))
  ) {
    return "cm6-span-vs-container";
  }

  if ((everySel(a, CALLOUT_MARK) && everySel(b, TITLE_MARK)) || (everySel(b, CALLOUT_MARK) && everySel(a, TITLE_MARK))) {
    return "callout-vs-title";
  }

  if (
    (everySel(a, /\.bases-calendar/) && everySel(b, /\.bases-chart/)) ||
    (everySel(b, /\.bases-calendar/) && everySel(a, /\.bases-chart/))
  ) {
    return "bases-subview-mismatch";
  }

  const aRootIdx = COMPONENT_ROOTS.findIndex((re) => everySel(a, re));
  const bRootIdx = COMPONENT_ROOTS.findIndex((re) => everySel(b, re));
  if (aRootIdx !== -1 && bRootIdx !== -1 && aRootIdx !== bRootIdx) return "distinct-component-root";
  if (aRootIdx !== -1 && bRootIdx === -1 && !someSel(b, COMPONENT_ROOTS[aRootIdx])) return "distinct-component-root";
  if (bRootIdx !== -1 && aRootIdx === -1 && !someSel(a, COMPONENT_ROOTS[bRootIdx])) return "distinct-component-root";

  return null;
}
