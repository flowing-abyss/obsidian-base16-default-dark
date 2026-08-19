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

// ---------------------------------------------------------------------------
// Shorthand/longhand property-conflict awareness.
//
// A candidate pair originally required `earlier.prop === later.prop` -
// literal string equality. That misses every shorthand/longhand pair that
// sets an overlapping underlying value: `padding: 12px` (sets all four
// physical padding sides) and `padding-inline-start: 0` (sets one of them)
// compete for the SAME rendered box side even though their property names
// differ, and reordering can flip which one wins for that side exactly like
// a same-named-property conflict can. The original regression this gate
// exists to catch was a `padding` conflict; had its sibling been
// `padding-left` instead of `padding`, literal equality would have missed
// it entirely.
//
// This expands each side to the set of ATOMIC physical longhands it can
// touch, and treats two declarations as conflicting iff those sets
// intersect. Scoped to the property families that actually appear in this
// theme's declarations (verified: `grep` every `prop:` in src/**/*.css) -
// not a general CSS shorthand table. Logical properties (`padding-inline-*`,
// `margin-block-*`, `inset-inline-*`) are mapped to their physical
// equivalent assuming `direction: ltr` and `writing-mode: horizontal-tb`,
// which is true for every rule in this theme (no `dir="rtl"`/vertical
// writing-mode support exists here) - flag this assumption if either is
// ever introduced.
const PROPERTY_EXPANSIONS = {
  background: [
    "background-color",
    "background-image",
    "background-position",
    "background-repeat",
    "background-size",
    "background-attachment",
    "background-origin",
    "background-clip",
  ],
  border: [
    "border-top-width",
    "border-top-style",
    "border-top-color",
    "border-right-width",
    "border-right-style",
    "border-right-color",
    "border-bottom-width",
    "border-bottom-style",
    "border-bottom-color",
    "border-left-width",
    "border-left-style",
    "border-left-color",
  ],
  "border-top": ["border-top-width", "border-top-style", "border-top-color"],
  "border-right": ["border-right-width", "border-right-style", "border-right-color"],
  "border-bottom": ["border-bottom-width", "border-bottom-style", "border-bottom-color"],
  "border-left": ["border-left-width", "border-left-style", "border-left-color"],
  "border-width": ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"],
  "border-style": ["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"],
  "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  "margin-inline-start": ["margin-left"],
  "margin-inline-end": ["margin-right"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block-start": ["margin-top"],
  "margin-block-end": ["margin-bottom"],
  "margin-block": ["margin-top", "margin-bottom"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  "padding-inline-start": ["padding-left"],
  "padding-inline-end": ["padding-right"],
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block-start": ["padding-top"],
  "padding-block-end": ["padding-bottom"],
  "padding-block": ["padding-top", "padding-bottom"],
  inset: ["top", "right", "bottom", "left"],
  "inset-inline-start": ["left"],
  "inset-inline-end": ["right"],
  "inset-inline": ["left", "right"],
  "inset-block-start": ["top"],
  "inset-block-end": ["bottom"],
  "inset-block": ["top", "bottom"],
  font: ["font-style", "font-variant-caps", "font-weight", "font-stretch", "font-size", "line-height", "font-family"],
};

// The set of atomic physical longhands a property touches. An unmapped
// property (already atomic, e.g. "color", or already a physical longhand,
// e.g. "padding-left") expands to itself.
export function expandProperty(prop) {
  return PROPERTY_EXPANSIONS[prop] ?? [prop];
}

// True iff two (possibly different) property names can conflict - i.e. can
// both determine the rendered value of the same atomic longhand.
export function propertiesConflict(propA, propB) {
  if (propA === propB) return true;
  const setA = expandProperty(propA);
  const setB = expandProperty(propB);
  return setA.some((x) => setB.includes(x));
}

// Detects one specific hazard this walker's selector-extraction does NOT
// handle correctly rather than mis-parse it: `rawSelector = ....split(/}|\*\//).pop()`
// (below) means that if a "*/" (a comment's end) appears anywhere in a
// block's selector-list text, everything before AND INCLUDING that "*/" is
// discarded - correct when the comment precedes the whole selector list
// (`/* note */\n.a, .b {`, nothing lost), but WRONG when a comment sits
// *inside* a comma-separated list (`.a,\n/* note on .b */\n.b {`): the
// `.a,` arm is silently dropped, and every downstream consumer (specificity,
// declarations, candidate detection) would see a shortened, wrong selector
// list with no error. This never occurs today (verified), but the fix
// applied for Finding 4 of the Task-4 review specifically ADDS comments to
// existing multi-selector comma-list blocks, which is exactly the shape
// that triggers it - so this throws loudly instead of silently mis-parsing
// if it ever does.
//
// `ownSpan` is the text truly belonging to one block's own selector region
// (after the previous block's closing "}", if any). A comma appearing
// before the first comment WITHIN that span means an arm was terminated
// right before the comment - the hazard shape.
function assertNoCommentInsideSelectorList(ownSpan, startLine) {
  const commentOpen = ownSpan.indexOf("/*");
  if (commentOpen === -1) return;
  const beforeComment = ownSpan.slice(0, commentOpen);
  if (beforeComment.includes(",")) {
    throw new Error(
      `parseBlocks: comment found INSIDE a comma-separated selector list near line ${startLine} ` +
        `(a "," appears before a "/* */" comment in the same selector-list text). This walker's ` +
        `selector extraction (rawSelector = ....split(/}|\\*\\//).pop()) would silently DROP every ` +
        `selector arm before that comment. Move the comment above the whole selector list instead of ` +
        `between two comma-separated arms, or teach parseBlocks to handle it properly - do not ignore ` +
        `this error.\n  Selector-list text: ${JSON.stringify(ownSpan.slice(0, 200))}`,
    );
  }
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
        // selectorStart always sits right after the previous block's "}"
        // (or the start of the file), so this span never contains a "}" of
        // its own - it IS this block's own selector region already.
        const fullSpan = src.slice(selectorStart, start);
        assertNoCommentInsideSelectorList(fullSpan, startLine);
        const rawSelector = fullSpan.split(/}|\*\//).pop();
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
// legacy cascade) whose properties can conflict (propertiesConflict, see
// above) with equal specificity, differing values, and matching
// !important — the only shape in which the split's reordering can flip
// which one wins (see check-cascade.mjs for how candidates are computed).
// Most candidates are still not a real risk, because their two selectors
// can never match the very same DOM element: Obsidian composes its UI out
// of self-contained components (a modal, a sidebar pane, a plugin's own
// widget, a CodeMirror line-type class, a Prism-highlighted span) and
// rarely assigns two different components' "owning" marker classes to one
// shared node. Each rule below states ONE piece of that reasoning and
// applies it to every matching candidate, rather than re-deriving the same
// argument pair by pair.
//
// Every dismissal carries a `kind`:
//   - "structural": provable from CSS semantics or a verified, hard
//     architectural invariant (a pseudo-element is never a real element; a
//     tag name is unique per element; Modal.open()/Menu.showAtPosition
//     both append directly to document.body - verified by reading the
//     shipped app.js - so a modal/menu is never a descendant of a
//     workspace-leaf-content pane, and vice versa).
//   - "empirical": rests on an observation about how a specific plugin
//     renders in THIS vault (e.g. "Hybrid Search's preview panel doesn't
//     contain a Search-pane row", checked live via `obsidian eval`) rather
//     than something guaranteed by CSS or Obsidian's core architecture. A
//     plugin update could invalidate an empirical dismissal without
//     touching this theme at all - see task-4-report.md's follow-up fix
//     report for exactly which cases were live-verified and which were
//     not.
// check-cascade.mjs reports these counts separately so the two claims are
// never blurred into one "dismissed" number.
//
// Correction (previous version of this comment claimed "None of these
// component subtrees nests inside another one included here" - that's
// false in general: a hover popover's body can contain a math block or an
// embed, a sidebar split's view-content can contain a math block, etc. The
// specific pairs where nesting is actually possible are handled by their
// own dedicated rules below (with an honest "structural" vs "empirical"
// kind), not swept into the generic COMPONENT_ROOTS list, which now only
// makes the (still not airtight, but reviewed) claim that two DIFFERENT
// listed roots don't nest in each other.
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
// Splits a selector into its space/combinator-separated compounds, treating
// whitespace INSIDE (), [], or a functional pseudo-class's argument list as
// non-splitting (fixes a bug: naive `.split(/\s+/)` on
// `ul:not(.a, .b)` sees the space after the comma and wrongly treats
// `.b)` as its own trailing "compound", which has no tag and made
// rightmostTag() report `null` - silently disabling the tag-mismatch rule
// for every selector with a multi-argument :not()/:is()/:where()/:has()).
function splitCompounds(sel) {
  const parts = [];
  let depth = 0;
  let cursor = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /\s/.test(c)) {
      if (i > cursor) parts.push(sel.slice(cursor, i));
      cursor = i + 1;
    }
  }
  if (cursor < sel.length) parts.push(sel.slice(cursor));
  return parts.filter((p) => p && !/^[>+~]$/.test(p));
}

function rightmostTag(sel) {
  const compounds = splitCompounds(sel.trim());
  const last = compounds[compounds.length - 1];
  if (!last || last.match(/^[.#[:*]/)) return null;
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
// `.menu-scroll` classes) and Modal class (`.modal-container`/`.modal`,
// which every SuggestModal-based `.prompt` and plugin field-editor modal
// builds on, including Metadata Menu's own `.metadata-menu.modal-container`
// and Hybrid Search's `.float-search-modal`) both append their DOM node
// directly to `activeDocument.body`/`document.body` - verified by reading
// the shipped app.js:
//   Menu.prototype.showAtPosition:  i=(t=t||activeDocument).body; ...; i.appendChild(l)
//   Modal.prototype.open:           e.containerEl.isConnected || activeDocument.body.appendChild(e.containerEl)
// - never as a descendant of a `.workspace-leaf-content` pane (of ANY
// data-type, not just markdown), and a leaf's content is never inside a
// modal/menu either, even when one is open at the time.
const MENU_MARK = /\.menu-scroll|\.menu\b|\.suggestion-container/;
const PROMPT_MARK = /\.prompt\b|\.modal\b/;
const MODAL_LIKE_MARK = /\.prompt\b|\.modal\b|\.metadata-menu\.modal-container|\.float-search-modal\b/;
const LEAF_PANE_MARK = /\bworkspace-leaf-content\[data-type=/;

// A .cm-line receives exactly one markdown line-type class from CM6's
// mode (HyperMD-codeblock / HyperMD-header-N / HyperMD-quote-N /
// HyperMD-list-line-N / plain) - verified live and via source: these are
// mutually exclusive per line, and content inside a fenced code block is
// not reparsed for heading/emphasis/list syntax.
const LINE_TYPE = /\.hypermd-|\.cm-line\.hypermd-/i;
// Nested SPAN-level marks within a line's content - never the same DOM
// node as the line's own .cm-line div.
const SPAN_MARK =
  /\.cm-inline-code|\.cm-strong|\.cm-em|\.cm-formatting-list|\.cm-formatting|\.tag\b|\.task-list-item-checkbox\b/i;
// Ancestor/sibling *container* elements Obsidian's widgets create around or
// near a line - never the .cm-line element itself.
const LINE_ADJACENT_CONTAINER = /\.callout\b|\.callout-|\binline-title\b|\.popover\b|\.popover-/i;
const CALLOUT_MARK = /\.callout\b|\.callout-/i;
const TITLE_MARK = /inline-title/i;
// The note-title element and Reading View's collapsible-list toggle icon
// are both specific, single-instance UI widgets - verified live (tag
// inspection): `.inline-title` is a contenteditable DIV sibling of
// `.cm-content` (see TITLE_ELEMENT_MARK below); `.list-collapse-indicator`
// is a small icon element for folding an embedded list. Neither is ever
// the callout container (`.callout`/`.callout-title`/`.callout-content`)
// wrapping unrelated content, nor each other.
const SMALL_WIDGET_MARK = /list-collapse-indicator/i;
// Any popover's own chrome/container (`.popover`/`.popover-*`, including
// the Hover Editor plugin's `.popover.hover-editor`) vs. a title element
// nested inside SOME popover's body (`.hover-popover .inline-title`) -
// container vs. a specific descendant element, never the same node.
const POPOVER_CONTAINER_MARK = /\.popover\b|\.popover-/i;
const TOKEN_MARK = /\.token\./;

// CM6 tokenizes a note's YAML frontmatter block (`.cm-atom.cm-hmd-frontmatter`,
// `.frontmatter.language-yaml .atrule`) and its Markdown body as separate
// language regions - verified live: opening a note with frontmatter in
// Source mode and inspecting a `.cm-atom.cm-hmd-frontmatter` element's full
// class list shows none of the body-content decoration classes below.
const FRONTMATTER_REGION_MARK = /\.cm-atom\.cm-hmd-frontmatter|\.frontmatter\.language-yaml/;
// Markdown-body CM6 decoration / rendered-link classes that only ever apply
// to content OUTSIDE the frontmatter region (or, for `.inline-title`, are a
// completely separate element - see TITLE_ELEMENT_MARK below).
const BODY_DECORATION_MARK =
  /\.cm-header-\d|\binline-title\b|\.internal-link|\.cm-hmd-internal-link|\.external-link|\.cm-link\b|\.tag\b|\.cm-strong|\.cm-em|\.callout-title|\.cm-formatting-list/i;
// The note-title element itself (bare `.inline-title`, not reached through
// an unrelated ancestor). Verified live: `.inline-title`'s parent is
// `.cm-sizer`, and `.inline-title.closest(".cm-content")` is null - it is a
// sibling of the CM6 content region, never a descendant that could carry a
// body-content decoration class.
const TITLE_ELEMENT_MARK = /^\.inline-title\b/;

const SCROLLBAR_PSEUDO_MARK = /::-webkit-scrollbar/;

// Chrome CONTROL elements (title-bar buttons) inside a hover-preview
// popover, distinct from any content rendered in the popover's body.
const POPOVER_CHROME_MARK = /\.popover-action\b|\.popover-header-icon\b/;

// A specific interactive control element (verified: rightmost tag is
// `button`) is never literally the coarse pane-wrapper `<div>` it may be
// nested many levels beneath.
const FIELD_BTN_CONTROL_MARK = /\.field-btn-container\b.*\bbutton\b|\bbutton\.property-metadata-menu\b/;
const SPLIT_CONTAINER_SELF_MARK = /:is\(\.mod-(?:left|right)-split, ?\.mod-(?:left|right)-split\)\s*$/;

// Content that only exists inside a LIVE, embedded CodeMirror 6 editor
// instance, or inside Another Quick Switcher's own scroll wrapper -
// checked empirically (not a hard architectural guarantee) for the modals
// this theme's selectors reference: Hybrid Search's `.hybrid-search-preview`
// panel was verified live to render via static Prism-highlighted HTML, not
// a live CM6/MathJax instance. Task Search's and Another Quick Switcher's
// own floating-prompt modals were NOT individually re-verified for this -
// the dismissal below rests on their being simple suggestion-list UIs, the
// same category of modal, not on a direct DOM check of each one.
const MODAL_LIVE_CONTENT_MARK =
  /\.cm-highlight\b|\.cm-math\b|\.mjx-tex|\.cm-formatting|\.cm-url\b|\bscrollcontainer\b|\.is-flashing\b/i;

// Container element ITSELF (selector ends at `.view-content`, not a
// descendant of it) vs. a math-render target nested arbitrarily deep
// inside such a container - structural regardless of whether math actually
// renders inside that pane, because the two selectors target different
// DOM nodes (the container vs. something nested inside it), never the same
// one.
const SPLIT_VIEW_CONTENT_SELF_MARK = /\.workspace-leaf-content\s+\.view-content\s*$/;
const MATH_NESTED_MARK = /\.math\.math-|\.mjx-tex|\.cm-math\b/i;

// A selector targeting the outer view CONTAINER itself (selector ends at
// `.markdown-source-view`/`.markdown-preview-view`, not a descendant of it)
// vs. a CM6 line-type class, which is always on a `.cm-line` DIV nested
// (however deeply, including inside an embed) inside that container -
// never the container element itself.
const VIEW_CONTAINER_SELF_MARK = /\.markdown-(?:source|preview)-view\s*$/;

// An embed wrapper (`.inline-embed`/`.markdown-embed`, the container div
// Obsidian renders an embedded note/image/file into) vs. `.external-link`
// (an anchor Obsidian assigns to external-URL links). Empirical, not a
// verified structural claim: this rests on the assumption that Obsidian
// never assigns `.external-link` to the embed's own container div, which
// is consistent with Obsidian's link/embed conventions but was not
// confirmed live via DOM inspection the way `.task-list-item-checkbox`'s
// and `.tag`'s tags were.
const EMBED_MARK = /\.inline-embed\b|\.markdown-embed\b/;
const EXTERNAL_LINK_MARK = /\.external-link\b/;

// Plugin-specific "owning component" roots reviewed empirically (this
// vault's actual installed-plugin list, `app.plugins.plugins`) rather than
// structurally: each plugin renders its own self-contained widget and this
// theme's selectors for it don't overlap with any other plugin's, but nesting
// isn't ruled out by CSS/DOM architecture the way the "structural" rules
// above are - a plugin update could in principle change this.
const TASKS_QUERY_ROOT_MARK = /\.contains-task-list\.plugin-tasks-query-result/;
const AQS_ITEM_MARK = /\.another-quick-switcher__/;
const BASES_ELEMENT_MARK = /\.bases-td\b|\.bases-header\b|\.bases-view\b/;
// Core Search-pane row/match classes - verified empirically, not
// structurally: Quick Switcher and Hybrid Search's floating prompts were
// checked live (`obsidian eval`) and render results as `.suggestion-item`/
// plugin-specific classes, never `.tree-item-self`/`.search-result-file-*`.
// Not individually re-checked for every `.prompt`/`.modal` selector this
// rule dismisses against.
const SEARCH_PANE_MARK = /\.tree-item-self|\.search-result-file/;

// Self-contained "owning component" marker classes for the case where BOTH
// sides carry a DIFFERENT one of these markers - reviewed as defensible
// (different plugin/widget ownership) but this is a plugin-architecture
// observation, not a CSS/DOM proof, so it's reported as "empirical".
export const COMPONENT_ROOTS = [
  TASKS_QUERY_ROOT_MARK,
  AQS_ITEM_MARK,
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
  FRONTMATTER_REGION_MARK,
  TITLE_ELEMENT_MARK,
  SCROLLBAR_PSEUDO_MARK,
  SEARCH_PANE_MARK,
  /\.hybrid-search-preview/, // Hybrid Search plugin's note-preview panel (verified live: never contains a Search-pane row)
  /\bbases-/, // Bases plugin (generic - kept last so more specific bases-* entries above win)
];

// One-sided structural/empirical dismissal rules: pairs where only ONE side
// carries a recognizable marker and the other side merely doesn't mention
// it (not "provably can't be the same element" on its own - see the
// correction in the header comment above). Each entry here replaces what
// used to be a blanket "one side matches, other doesn't" fallback with an
// explicit, individually-reasoned rule, symmetric (checked in both
// directions), tagged with its own kind.
const ONE_SIDED_RULES = [
  {
    // A pseudo-element is an anonymous generated box, per the CSS Selectors
    // spec - it is never itself a real element with a tag name, so it can
    // never be the SAME element as any concrete-tag selector on the other
    // side. This needs no Obsidian-specific knowledge at all.
    name: "scrollbar-pseudo-vs-real-element",
    kind: "structural",
    markA: SCROLLBAR_PSEUDO_MARK,
    markB: /./,
  },
  {
    name: "frontmatter-region-vs-body-decoration",
    kind: "structural",
    markA: FRONTMATTER_REGION_MARK,
    markB: BODY_DECORATION_MARK,
  },
  {
    name: "title-element-vs-body-decoration",
    kind: "structural",
    markA: TITLE_ELEMENT_MARK,
    markB: BODY_DECORATION_MARK,
  },
  {
    name: "modal-vs-leaf-pane",
    kind: "structural",
    markA: MODAL_LIKE_MARK,
    markB: LEAF_PANE_MARK,
  },
  {
    name: "nonmarkdown-leaf-vs-editing-content",
    kind: "structural",
    // LEAF_PANE_MARK here is deliberately narrowed inline to exclude the
    // markdown leaf type - only non-markdown leaves (Outline, Search, etc.)
    // are structurally guaranteed to never embed CM6 editor content.
    markA: /\bworkspace-leaf-content\[data-type=(?!.markdown.)/,
    markB: EDITING_MARK,
  },
  {
    name: "popover-chrome-vs-editor-content",
    kind: "structural",
    markA: POPOVER_CHROME_MARK,
    markB: EDITING_MARK,
  },
  {
    name: "control-vs-split-container-self",
    kind: "structural",
    markA: FIELD_BTN_CONTROL_MARK,
    markB: SPLIT_CONTAINER_SELF_MARK,
  },
  {
    name: "split-view-content-self-vs-nested-math",
    kind: "structural",
    markA: SPLIT_VIEW_CONTENT_SELF_MARK,
    markB: MATH_NESTED_MARK,
  },
  {
    name: "modal-vs-live-embedded-content",
    kind: "empirical",
    markA: MODAL_LIKE_MARK,
    markB: MODAL_LIVE_CONTENT_MARK,
  },
  {
    name: "modal-vs-search-pane-row",
    kind: "empirical",
    markA: MODAL_LIKE_MARK,
    markB: SEARCH_PANE_MARK,
  },
  {
    name: "tasks-query-root-vs-other",
    kind: "empirical",
    markA: TASKS_QUERY_ROOT_MARK,
    markB: /./, // any other marker-less selector, since this root's own
    // dismissal already required the OTHER side to not itself be a
    // tasks-query-root (aRootIdx===-1 case, checked by caller)
  },
  {
    name: "aqs-item-vs-other",
    kind: "empirical",
    markA: AQS_ITEM_MARK,
    markB: /./,
  },
  {
    name: "bases-element-vs-other",
    kind: "empirical",
    markA: BASES_ELEMENT_MARK,
    markB: /./,
  },
  {
    name: "callout-vs-small-widget",
    kind: "structural",
    markA: CALLOUT_MARK,
    markB: SMALL_WIDGET_MARK,
  },
  {
    name: "small-widget-vs-title-element",
    kind: "structural",
    markA: SMALL_WIDGET_MARK,
    markB: TITLE_MARK,
  },
  {
    name: "popover-container-vs-title-element",
    kind: "structural",
    markA: POPOVER_CONTAINER_MARK,
    markB: TITLE_MARK,
  },
  {
    name: "view-container-self-vs-line-type",
    kind: "structural",
    markA: VIEW_CONTAINER_SELF_MARK,
    markB: LINE_TYPE,
  },
  {
    name: "embed-container-vs-external-link",
    kind: "empirical",
    markA: EMBED_MARK,
    markB: EXTERNAL_LINK_MARK,
  },
];

function testOneSided(rule, a, b) {
  if (everySel(a, rule.markA) && everySel(b, rule.markB) && !someSel(b, rule.markA)) return true;
  if (everySel(b, rule.markA) && everySel(a, rule.markB) && !someSel(a, rule.markA)) return true;
  return false;
}

// Categorizes one candidate pair. Returns { tag, kind } on dismissal
// ("structural" or "empirical" - see header comment), or null if none of
// the bulk rules apply - callers must then consult scripts/cascade-triage.mjs
// for an individually-reviewed verdict, and FAIL if there isn't one.
export function classifyCandidate(p) {
  const a = p.aSelectors;
  const b = p.bSelectors;

  const aTags = a.map(rightmostTag).filter(Boolean);
  const bTags = b.map(rightmostTag).filter(Boolean);
  const aHasWild = a.map(rightmostTag).some((t) => t === null);
  const bHasWild = b.map(rightmostTag).some((t) => t === null);
  if (aTags.length && bTags.length && !aHasWild && !bHasWild && !aTags.some((t) => bTags.includes(t))) {
    return { tag: "tag-mismatch", kind: "structural" };
  }

  if (
    (everySel(a, READING_MARK) && everySel(b, EDITING_MARK)) ||
    (everySel(a, EDITING_MARK) && everySel(b, READING_MARK))
  ) {
    return { tag: "reading-vs-editing-mode", kind: "structural" };
  }

  if ((everySel(a, MENU_MARK) && everySel(b, PROMPT_MARK)) || (everySel(a, PROMPT_MARK) && everySel(b, MENU_MARK))) {
    return { tag: "menu-vs-prompt", kind: "structural" };
  }

  if (everySel(a, TOKEN_MARK) !== everySel(b, TOKEN_MARK) && (everySel(a, TOKEN_MARK) || everySel(b, TOKEN_MARK))) {
    return { tag: "prism-token-vs-other", kind: "structural" };
  }

  if (
    (everySel(a, LINE_TYPE) &&
      (everySel(b, LINE_ADJACENT_CONTAINER) || everySel(b, SPAN_MARK) || (everySel(b, LINE_TYPE) && a.join() !== b.join()))) ||
    (everySel(b, LINE_TYPE) &&
      (everySel(a, LINE_ADJACENT_CONTAINER) || everySel(a, SPAN_MARK) || (everySel(a, LINE_TYPE) && a.join() !== b.join())))
  ) {
    return { tag: "cm6-line-vs-adjacent", kind: "structural" };
  }
  if (
    (everySel(a, SPAN_MARK) && everySel(b, LINE_ADJACENT_CONTAINER)) ||
    (everySel(b, SPAN_MARK) && everySel(a, LINE_ADJACENT_CONTAINER))
  ) {
    return { tag: "cm6-span-vs-container", kind: "structural" };
  }

  if ((everySel(a, CALLOUT_MARK) && everySel(b, TITLE_MARK)) || (everySel(b, CALLOUT_MARK) && everySel(a, TITLE_MARK))) {
    return { tag: "callout-vs-title", kind: "structural" };
  }

  if (
    (everySel(a, /\.bases-calendar/) && everySel(b, /\.bases-chart/)) ||
    (everySel(b, /\.bases-calendar/) && everySel(a, /\.bases-chart/))
  ) {
    return { tag: "bases-subview-mismatch", kind: "empirical" };
  }

  for (const rule of ONE_SIDED_RULES) {
    if (testOneSided(rule, a, b)) {
      return { tag: rule.name, kind: rule.kind };
    }
  }

  // Both sides carry a DIFFERENT recognized "owning component" root -
  // reviewed as defensible (see COMPONENT_ROOTS' comment), reported as
  // empirical.
  const aRootIdx = COMPONENT_ROOTS.findIndex((re) => everySel(a, re));
  const bRootIdx = COMPONENT_ROOTS.findIndex((re) => everySel(b, re));
  if (aRootIdx !== -1 && bRootIdx !== -1 && aRootIdx !== bRootIdx) {
    return { tag: "distinct-component-root", kind: "empirical" };
  }

  return null;
}
