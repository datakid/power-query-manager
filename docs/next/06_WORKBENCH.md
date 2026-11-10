# 06 — The workbench

**Read this after `00` … `05` are finished, or at least after Phase 3 (`03_EDIT_RUN_SAVE.md`) is green.**
This file is Phase 6. It turns quoin from *"open, pick one query, run, look"* into a **workbench for Power Query and VBA**: a place where someone with 300 queries and 40 modules can find anything, understand how it fits together, run exactly what they want, see every step, change the structure safely, and save a file Excel still trusts.

Everything in `00_START_HERE.md` still applies: guardrails G-1 … G-6, lint rules, working rules W-1 … W-8, the Definition of Done in §4. Where this file needs an exception, §2 names it explicitly. Nothing else is relaxed.

**Look and placement.** This file decides *what* the workbench does. `02B_VISUAL_REFINEMENT.md` decides *how it looks and where each control sits*: floating rounded panes, sentence-case headers, comfortable density, the disclosure tiers, and the control inventory (§5 there). Sizes given below (top bar height, pane header height, row heights) are superseded by `02B` §2. Every command in this file must appear in `02B` §5. If one is missing, add it there and do not drop it. The visual target is `assets-v2/refined-preview.html`.

---

## 0. The problem, in the owner's words, and what it means

> *"When handling files with many queries … manage them, run and edit them in a super intuitive way with many options … right now the app is just run and watch results, no granular control … something that offers an easier and better way of running both VBA and queries than even the main app. You see each step result, you can reorder steps. I really want a serious workbench."*

What the current beta does (read from `src/app/workspace.js`, `runner.js`, `m-worker.js`, `core/m/engine.js` on the `beta` branch):

- One rail, one editor, one result. Selecting an item **cancels any running query** (`select()` calls `cancel()`).
- One run at a time, one query at a time. No "run all", no "run these", no idea which queries are broken until you open each.
- Steps exist only as a row of plain buttons after a run (`renderResult` → `this.steps`), each of which starts a **separate full run** (`run(name)`), recomputing everything before it.
- The worker keeps exactly one result (`let last`). Any new run throws the previous away, so nothing can be compared or pinned.
- No search, no filter, no dependency view, no problems list, no tabs, no command palette.
- VBA is a text box. No outline of procedures, no references, no structure checks.

So the crux is not a missing button. It is that the app has **no model of the workbook as a whole** — of queries as a graph, of steps as objects, of results as things you keep. This phase builds those three models first (pure, testable), and then the UI on top of them.

### The five verbs

Every item in this file serves one of these. If a feature serves none, it does not get built.

| Verb | The user wants to… | Built by |
|---|---|---|
| **Find** | get to any query, step, procedure or line in under two seconds | navigator, command palette, search across code, go to definition |
| **Understand** | see what depends on what, what is broken, what changed, what each step does | dependency graph, problems, step deltas, profiles, VBA outline and call graph |
| **Run** | run one thing, a selection, a chain, or everything, and keep the results | run queue, step evaluation, result store, pins, stale tracking |
| **Change** | edit code and structure (steps) safely, with preview and undo | step operations, grid-to-step, find/replace, procedure revert |
| **Ship** | review every change and save a real file | extended Changes review, then E-9/E-10 unchanged |

### Why this can be better than Excel's own editor

Not by imitating the Power Query ribbon. By being **code-first and honest**:

- Excel re-evaluates on every click in Applied Steps. quoin evaluates **all steps of a query in one pass** and keeps every step's result, so stepping is instant (WB-7).
- Excel cannot run 300 queries and tell you which 7 are broken without refreshing the workbook. quoin can, without touching the file (WB-9, WB-18).
- Excel hides the M that its buttons write. quoin shows the exact code a grid action will insert, before it inserts it (WB-16).
- Excel's "Move up" in Applied Steps breaks references silently. quoin refuses a move that would break a reference, or rewires the chain and shows the diff first (WB-15).
- The VBE has no outline, no find-references, no structure check until you compile. quoin has all three (WB-22 … WB-24).

---

## 1. The shape of the workbench

Desktop, 1280×800 and wider. Every pane is a rounded surface (`--r-3`) floating on `--ground` with an 8 px `--gutter` between panes (`02B` §3.3). Each is resizable by pointer and by keyboard (the existing `separator` pattern in `workspace.js`; the separator *is* the gutter, with a 2 px slate line on hover and focus), collapsible, and has a 36 px pane header (`02B` §4.4). The diagram below shows content and order, not borders: the box lines are gutters.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◰ quoin   Sales model.xlsm · 2.4 MB · xlsm          ⌘K Search everything     [Run ▸] ⋯  │ top bar
├───────────────┬──────────────────────────────────────────────┬───────────────────────────┤
│ NAVIGATOR  ⌕ ⚲│ ● Sales_Clean ×  ○ fx_Fiscal ×  ◇ Module1 ×  │ STEPS            ⟳ all   │
│ [Queries|VBA] │──────────────────────────────────────────────│ ● Source          1 240 r │
│ ⌕ sales       │ 1  let                                       │ ● Navigation      1 240 r │
│ ▾ Staging  12 │ 2    Source = Excel.CurrentWorkbook(){…},    │ ● Promoted       +0  hdr │
│   ● Sales_Raw │ 3    #"Changed Type" = Table.Transform…,     │ ● Changed Type   3 types │
│   ● Sales_Cle…│ 4 ▌  #"Filtered Rows" = Table.SelectRows(…), │▸● Filtered Rows  −312 r  │ step cursor
│   ◌ Returns   │ 5    #"Added Margin" = Table.AddColumn(…),   │ ○ Added Margin   +1 col  │
│ ▾ Outputs   8 │ 6    Grouped = Table.Group(…)                │ ○ Grouped          —     │
│   ✕ Summary   │ 7  in                                        │                           │
│   ● Regions   │ 8    Grouped                                 │ DEPENDS ON   USED BY      │
│ ▸ Functions 6 │                                              │ Sales_Raw    Summary      │
│               │                                              │ fx_Fiscal    Regions      │
│ [Edited 3]    │──────────────────────────────────────────────┴───────────────────────────│
│ [Errors 1]    │ RESULT · Filtered Rows ▾ │ Pinned (2) │ Compare │ Problems 4 │ Queue │ Graph │ dock
│ [Stale 5]     │ #  Region ▾   Date        Amount   Margin       928 rows · 6 cols · 41 ms   │
│               │ 1  North      2024-01-03  1 204.00  null                                   │
├───────────────┴──────────────────────────────────────────────────────────────────────────┤
│ ✓ Ran Sales_Clean · 7 steps · 41 ms        Problems 4   Edited 3   matches Excel   en-US │ readout
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Regions**

| Region | Content | Default size |
|---|---|---|
| Top bar | mark + wordmark, file meta, command palette trigger, Changes N, Print, Run split-button, overflow (`02B` §4.1) | 52 px, on the ground |
| Navigator | Queries / VBA segmented control, search, filter chips, grouped virtual list with beads, selection bar | 272 px, 220–420 |
| Editor area | tab strip, one or two editor groups (split), breadcrumb for VBA procedures | flexible |
| Inspector | context-aware: **Steps + Dependencies** for a query, **Outline + References + Calls** for a module | 312 px, 260–480, collapsible |
| Dock | Result (follows the step cursor), Pinned, Compare, Problems, Queue, Graph, Changes, as a segmented control (`02B` §4.7) | 40 % height, 15–85 % |
| Readout | the inverted status bar, floating with rounded ends, counters as buttons (`02B` §4.8) | 32 px |

**Layout presets** (in the overflow menu and the palette): *Write* (navigator + editor, dock collapsed), *Debug* (editor + steps + dock at 50 %), *Review* (dock showing Changes at 70 %). Sizes live in memory (G-3) unless the owner approves D-1.

**At 390×844.** One region at a time with a floating rounded bottom bar holding a segmented control: *Items · Code · Steps · Result*, plus the problems counter (`02B` §4.11). Touch targets are ≥ 44 px. No drag-and-drop on touch; every drag action has a menu equivalent (§WB-15), and row actions are always visible. Dock tabs other than Result go into the Result region's segmented header. It must look designed, not squeezed (W-5).

---

## 2. Guardrails for this phase

### 2.1 Exceptions to G-5 (files this phase may touch)

G-5 says the M engine and the binary writers are off-limits unless an item names the file. These items name these files, and only for the purpose stated. Anything beyond that is still forbidden; record it under *Blocked*.

| File | Item | Allowed change | Not allowed |
|---|---|---|---|
| `src/core/m/engine.js` | WB-7 | add exported `evaluateSteps` and `evaluateMany`; refactor `setupRuntime`/`evaluate` only as far as needed to share the member map | changing evaluation semantics, library functions, laziness, errors |
| `src/workers/m-worker.js` | WB-8 | result store, protocol v2, streaming batch results, profile/filter requests | anything that evaluates M differently from `engine.js` |
| `src/app/runner.js` | WB-8 | protocol v2, batch runs, queue support | — |

Read-only imports from `src/core/m/lexer.js`, `parser.js`, `values.js` and `library/index.js` (for a build-time name list) are allowed from new pure modules. Never import the library into the main thread at runtime.

The binary writers (`zip-write.js`, `vba/cfb-write.js`, `vba/ovba-compress.js`, `pq/datamashup.js`) remain untouched. **Every change this phase makes reaches the file only as edited query text or edited module text, through the existing E-1 dirty model and the existing save path.** That is what keeps G-1 safe: a step reorder is a text edit; a grid-to-step is a text edit; a find/replace is a set of text edits.

### 2.2 G-3, G-4 stay as they are

- **G-3:** results, pins, run history, layout, density, bindings: memory only. The one storage key is still `quoin.theme`. See D-1.
- **G-4 — VBA is never executed.** The owner asked for "an easier and better way of running VBA". The honest answer belongs in the UI and in `docs/decisions.md`:

  > VBA runs against Excel itself: sheets, ranges, events, other workbooks, the file system, COM objects. A browser cannot provide that, and a simulation would show results that are not what Excel would do. quoin does not pretend. What it does instead: it makes VBA far easier to read, navigate, check and edit than the VBE (WB-22 … WB-24), and it **really runs** the part of a macro that drives Power Query — the queries a macro refreshes run in quoin, in the macro's order (WB-25).

  If the owner wants actual execution, that is D-3 and a separate brief. Do not start it.

### 2.3 Owner decisions (defaults apply until the owner says otherwise)

| ID | Question | Default | If the owner says yes |
|---|---|---|---|
| D-1 | Remember layout, density and pane sizes between visits? | **No** | add `quoin.layout` (one JSON value), update T-LINT-8 to allow exactly two keys, update README *Privacy* in the same commit |
| D-2 | Run queries in parallel on two workers? | **No** | out of this phase; a single worker with a shared member map is faster for dependent queries anyway (WB-7) |
| D-3 | Execute VBA? | **No** | separate brief; G-4 changes only by the owner's written word |
| D-4 | Add, rename or delete queries; change query groups? | **No** | needs `pq/datamashup.js`, connections and table parts: a separate brief with its own byte-preservation tests |
| D-5 | Glaze palette (`02A`) instead of sodium (`02`)? | **Yes** (the owner asked for low chroma) | — |

Record each decision and its date in `docs/decisions.md` when the owner gives it.

### 2.4 Lint and code rules — same as ever

No comments, `h()` only, colours only in `tokens.css`, spacing via `--s-*`, all text in `strings.js` with the tone rules, `src/core/**` never touches the DOM. New pure logic goes in **`src/core/wb/`** (new folder), or `src/core/vba/` for VBA analysis. New UI goes in `src/ui/wb/` (new folder). The app layer that wires them is `src/app/workbench.js`, which **replaces** `workspace.js` by the end of the phase (W-8 is satisfied because WB-10 names it).

---

## 3. Phase 6 — order, entry, exit

**Entry:** Phases 0–3 green (Phase 4 and 5 may run before or after; if after, the print preview gains the workbench's selection as a source, see WB-26). If Phase 2 was done with the sodium palette, do **I-R** (`02A`, the token swap) as the first commit of this phase. If Phase 2 was done without `02B`, do **I-V** (`02B`, shape, spacing and hierarchy) as the second, split into lettered commits by component (`I-Va` tokens, `I-Vb` buttons and inputs, `I-Vc` lists, `I-Vd` panes and headers, `I-Ve` overlays, `I-Vf` readout and mobile).

Six sub-phases. Models first, then the engine, then the shell, then the features. Each sub-phase ends green (W-4).

| Sub-phase | Items | Delivers |
|---|---|---|
| **6A Models (pure)** | WB-1 … WB-6 | query index & dependency graph, step model, let-block text transforms, VBA outline, fuzzy matcher, M code generation. All Node-tested. No UI. |
| **6B Engine & runs** | WB-7 … WB-9 | evaluate all steps in one pass, evaluate many queries in one context, result store, run queue, stale tracking |
| **6C Shell** | WB-10 … WB-13 | the layout above, navigator, tabs & split, command palette |
| **6D Query workbench** | WB-14 … WB-19 | steps panel, step operations, result dock, dependency view, problems, sources |
| **6E Editor intelligence** | WB-20, WB-21 | completion, signature help, definition, references, find/replace across the workbook |
| **6F VBA workbench** | WB-22 … WB-25 | outline & navigation, structure checks, references & call graph, macro → query links |
| **6G Proof** | WB-26 … WB-28 | changes review, performance budgets, visual baseline, the acceptance story |

Large items are split into lettered commits (`WB-15a`, `WB-15b` …); W-3 applies to each letter.

**Exit:** every T-WB test green; performance budgets in §6 met in Chromium; 32 new baseline screenshots looked at; the acceptance story (WB-28) passes end to end; `PROGRESS.md` has a Phase 6 section; README and `docs/decisions.md` describe the workbench.

---

## 4. The items

### 6A — Models (pure, `src/core/wb/`)

#### WB-1 — Query index and dependency graph
**Why:** everything that deals with "many queries" — grouping by layer, stale propagation, run order, impact, the graph — needs to know which query refers to which.

**Build:** `src/core/wb/deps.js`.

```
indexSection(sectionText) -> {
  members: [{ name, start, end, exprStart, exprEnd, isFunction, parseError|null }],
  refs:   Map<name, Set<name>>,      direct upstream members
  usedBy: Map<name, Set<name>>,      direct downstream
  layers: Map<name, number>,         0 = reads no other member
  cycles: [[name, …]],
  unresolved: Map<name, [{ ident, start, end }]>
}
updateMember(index, name, newExprText) -> index    incremental: re-parse one member, patch edges
upstreamOf(index, names, { transitive }) / downstreamOf(index, names, { transitive }) -> Set
topoOrder(index, names) -> [name]                   stable: ties broken by section order
```

References are found from the AST, not by regex: walk identifier nodes, resolve against let-scopes and function parameters (a step named `Sales` inside a `let` shadows the query `Sales`), and record the rest that match member names. `#shared` and `#sections` usage marks the member as *dynamic* (depends on everything; shown with a note). Unresolved identifiers that are not members and not in the generated library name list (WB-20) are recorded as unresolved.

A member that fails to parse keeps its old edges marked *unknown* until it parses again, so one typo does not make the graph flicker.

**Tests:** `T-WB-01` unit — shadowing by a step, by a function parameter, by a nested `let`; quoted identifiers `#"My Query"`; `#shared`; a 3-cycle; incremental update adds and removes edges; topo order is stable; 1 000 members index in under 300 ms in Node.

#### WB-2 — The step model
**Why:** steps are the unit of understanding in M. Today they are a list of names. They need to be objects with spans, inputs and a kind.

**Build:** `src/core/wb/steps.js`.

```
stepsOf(exprText, baseOffset) -> {
  shape: 'let' | 'expression' | 'function' | 'function-let',
  steps: [{
    name, quotedName,                 'Filtered Rows', '#"Filtered Rows"'
    span: { start, end },             the whole "name = expr" including its leading comments
    exprSpan: { start, end },
    inputs: [stepName],               earlier steps it references
    queries: [memberName],            members it references
    call: 'Table.SelectRows' | null,  outermost function called
    kind: 'source' | 'navigate' | 'filter' | 'sort' | 'add-column' | 'remove-columns' | 'rename' | 'types'
        | 'group' | 'merge' | 'append' | 'pivot' | 'expand' | 'promote' | 'custom',
    linear: boolean                   references exactly its predecessor, exactly once, as the first argument
  }],
  body: { span, ref: stepName | null }   the expression after "in"
}
```

`kind` comes from a table in `src/core/wb/step-kinds.js` mapping ~60 library function names to kinds (Table.SelectRows → filter, Table.Sort → sort, Table.AddColumn → add-column, Table.NestedJoin → merge, Table.Combine → append, Table.TransformColumnTypes → types …). Unknown calls are `custom`. The kind chooses an icon and a short label from `strings.js`; the step's own name is always shown, the label is secondary.

For `function-let` (a `(x) => let … in …` query) the steps are shown read-only with a note that a function's steps cannot be run without arguments — unless the user supplies arguments in WB-14's *Invoke* form.

Leading comments belong to the step below them; a trailing comment on the same line belongs to the step on that line. This rule matters for WB-3: moving a step moves its comments.

**Tests:** `T-WB-02` unit — UI-generated M (every step linear), hand-written M with non-linear inputs, comments in every position, a `let` whose body is not a step name, nested `let` inside a step (not flattened), a function query, CRLF.

#### WB-3 — Let-block text transforms
**Why:** reordering, inserting, renaming, deleting and bypassing steps must change only the text that has to change, preserve every other byte of the user's formatting, and never produce broken references silently.

**Build:** `src/core/wb/let-edit.js`. Every function takes the query text and returns `{ ok, text, changes: [{start, end, insert}], reason? }`. Never re-serialise from the AST. Rewrites identifiers using token positions from `lexer.js`, never regex.

```
canMove(model, from, to) -> { ok, mode: 'plain' | 'rewire', reason? }
moveStep(text, from, to, { rewire })
insertStepAfter(text, index, name, exprText, { rewire })    new step reads index, the old next step reads the new one
renameStep(text, index, newName)                            definition + every reference in this let, quoting as needed
deleteStep(text, index)                                     refused if referenced, unless linear: then rewire successor
bypassStep(text, index)                                     linear only: successor reads this step's input; step kept, unreferenced, marked
duplicateStep(text, index)                                  copy named "<name> (2)", inserted after, rewired
```

**Plain move** is allowed when no step would then reference a step defined after it (M allows forward references inside `let`, but quoin refuses them: they are legal and confusing, and Excel's UI never writes them). **Rewire move** is offered when every step on the path is `linear`: the moved step takes its new predecessor as input, its old successor takes its old input, the step after its new position takes it, and if the last step moved, the body is updated. Anything else is refused with a reason that names the step and the reference.

Separators: the comma after the last binding before `in` must be handled — moving the last step up must add a comma to the new last-but-one and remove it from the new last. Write explicit tests for this; it is where text transforms go wrong.

`bypassStep` exists because "turn this step off to see what happens" is the most-requested Applied Steps feature that Excel does not have. It rewires around the step and leaves the step text in place; the steps panel shows it as *bypassed*. Un-bypass restores the wiring. Both are plain text edits and appear in Changes like any other.

Quoting: `quoteIdent(name)` returns the bare name when it is a valid M identifier and not a keyword, else `#"…"` with `"` doubled. One function, used everywhere (WB-6 too).

**Tests:** `T-WB-03` unit, table-driven — every operation × {first, middle, last step} × {linear, non-linear} × {with comments, CRLF, trailing comma styles}; after every successful transform the result re-parses and `stepsOf` reports no forward reference and no unresolved name; every refusal names the blocking step; untouched characters are byte-identical (assert on the `changes` list, not only on the result).

#### WB-4 — VBA outline
**Why:** a 2 000-line module is unreadable as a flat text box.

**Build:** `src/core/vba/outline.js`, line-based scanner.

```
outlineModule(visibleText) -> {
  options: { explicit, compare, base, private },
  declarations: [{ kind: 'dim'|'const'|'type'|'enum'|'declare'|'event', name, scope, line }],
  procedures: [{ name, kind: 'sub'|'function'|'property-get'|'property-let'|'property-set',
                 scope: 'public'|'private'|'friend', isStatic, params: [{ name, byRef, optional, type }],
                 returns, startLine, endLine, bodyStartLine,
                 isEntryPoint, isEventHandler, eventOf }],
  problems: [{ line, col, code }]
}
```

Handles line continuations (` _` at end of line), `'` and `Rem` comments, string literals with doubled quotes, `:` statement separators, labels. `isEntryPoint` = public `Sub` with no required parameters in a standard module. `isEventHandler` = `Object_Event` names in document and class modules, and `Workbook_*` / `Worksheet_*` / `UserForm_*` / `Class_Initialize|Terminate`.

**Tests:** `T-WB-04` unit — every procedure kind, continuations inside a signature, a string containing `End Sub`, a comment containing `Sub X()`, `Declare PtrSafe Function`, a `Property Get`/`Let` pair, a module with only declarations, the cp-1252 and cp932 fixture modules.

#### WB-5 — Fuzzy matcher
**Build:** `src/core/wb/fuzzy.js`. `match(query, text) -> { score, ranges } | null`. Subsequence match, bonuses for word starts, camel humps, `_`/space/`.` boundaries and consecutive runs; case-insensitive with a bonus for exact case; diacritic-insensitive via `normalize('NFD')`. `rank(query, items, key, limit)`. Deterministic ties (shorter text, then original order).

**Tests:** `T-WB-05` unit — `sc` ranks `Sales_Clean` above `Discount`; `#"Changed Type"` matched by `ct`; CJK and RTL names; 10 000 items ranked in under 30 ms.

#### WB-6 — M code generation for grid actions
**Build:** `src/core/wb/m-gen.js`. Pure templates that return M text for: filter rows (equals, not equals, contains, begins with, greater/less, is null, is not null, in list), sort (multi-column), remove columns, keep columns, rename column, change type (using the culture-free `type number`, `type text`, `Int64.Type`, `type date` …), remove duplicates, keep first N rows, replace value.

Uses `quoteIdent` from WB-3, a `textLiteral` that escapes `"` and control characters with `#(cr)`/`#(lf)`/`#(tab)`, and number/date literals that are culture-independent (`#date(2024, 1, 3)`, never `"03/01/2024"`). Step names come from `strings.js` (`S.stepNames.filter = 'Filtered Rows'` …) and are made unique against the existing steps (`Filtered Rows 1`, as Excel does).

**Tests:** `T-WB-06` unit — every action; a column named `each`, `[x]`, `Amount "net"`, `#"`; a text value with a newline; generated text parses and, run against a small table in the engine (Node), produces the expected rows.

---

### 6B — Engine and runs

#### WB-7 — Evaluate every step in one pass; evaluate many queries in one context
**Why:** today each step button is a full separate run. For a 12-step query that is 12 runs, each repeating the work before it.

**Build:** in `src/core/m/engine.js` (named; see §2.1):

```
evaluateSteps(opts) -> {
  status, steps: [{ name, status: 'ok'|'error'|'stopped'|'skipped', value?, error?, durationMs, rowCount?, columns? }],
  final
}
```
Compile the member's `let` with its body replaced by a **record literal of all its step names** (look up the record AST node shape in `parser.js` — do not invent one). Force each field in order with its own `try`, timing each. Because the record fields share the `let`'s thunks, each step is evaluated once. An error in step 5 marks 5 as error and every step that depends on it as `skipped`; steps that do not depend on it still evaluate (that is information Excel cannot give).

Timing in a lazy language is attribution, not measurement: a step's time is the time spent forcing it *after* its inputs were already forced. Say so in the steps panel tooltip (`S.stepTimeNote`).

```
evaluateMany(opts, names) -> async iterator of { name, status, value?, error?, durationMs, flags, compare? }
```
One `setupRuntime`, one member map, members forced in the order given (the caller passes `topoOrder`). Upstream members are therefore evaluated once for the whole batch, not once per query. `RT.deadline` is reset per member so the timeout is per query. Function members are yielded as `skipped`. Need-binding inside a batch: pause, ask, resume that member (the existing round loop in `runQuery`, applied per member).

**Tests:** `T-WB-07` unit (Node, real engine) — a 12-step chain evaluates each step once (count calls with an instrumented library function in the test); error in a middle step skips only its dependants; `evaluateMany` over a diamond (A → B, A → C, B,C → D) evaluates A once; timeout in one member does not stop the next; results equal `runOnce` results for every member of every fixture (this is the guard that semantics did not change).

#### WB-8 — Result store and worker protocol v2
**Why:** to pin, compare, step through and page rows of more than one result, the worker must keep more than `last`.

**Build:** `m-worker.js`, `runner.js` (named).

- **Store:** `Map<resultId, { value, culture, member, step, bytesEstimate, lastUsed }>`. Limits in `src/core/limits.js`: at most 32 results and an estimated 6 000 000 cells in total; least-recently-used evicted first, **pinned results evicted last**. Step results of one evaluation share a group and are evicted together.
- **Messages** (main → worker): `run-steps`, `run-many`, `rows {resultId, start, count, view?}`, `profile {resultId, column?}`, `view {resultId, filters, sort}` → returns a `viewId` (an index permutation kept in the worker, so a filtered or sorted view of 300 000 rows never crosses to the main thread), `release {resultId}`, `export {resultId, format}`.
- **Messages** (worker → main): `member-result` and `step-result` streamed as each completes (the main thread keeps receiving while the worker computes), `need-binding`, `done`, `evicted {resultIds}`.
- **Cancel** still terminates the worker (E-5: back to idle within 200 ms). That also drops the store; every kept result becomes *evicted*: the grid keeps the rows it already has, says `S.rowsNotKept`, and offers *Run again*. Do not try to save the store across a terminate.
- `onerror` clears every run, as B-08 requires, and marks the store lost the same way.

**Tests:** `T-WB-08` unit on the store's eviction order (pure part extracted to `src/core/wb/result-store.js`); e2e — pin two results, run eight more, both pinned results still page rows; cancel mid-batch, grid says rows not kept, *Run again* works.

#### WB-9 — Run queue, run modes, stale tracking
**Why:** "run and watch" becomes "decide what to run".

**Build:** `src/app/orchestrator.js` (app layer) on top of pure `src/core/wb/run-plan.js` and `src/core/wb/status.js`.

**Run modes**, on the Run split-button, the navigator selection bar, the graph node menu and the palette:

| Mode | Runs | Shortcut |
|---|---|---|
| Run | the current query, all its steps (WB-7) | `Ctrl/Cmd+Enter` |
| Run to here | the current query up to the step at the caret or the step cursor | `Ctrl/Cmd+F10` |
| Run selected | the navigator selection, in topological order, one batch | `Ctrl/Cmd+Shift+Enter` |
| Run with downstream | the current query and everything that uses it | — |
| Run stale | every query whose status is stale | — |
| Run all | every non-function query | `Ctrl/Cmd+Alt+Enter` |

A batch is one `evaluateMany`. **Option:** *Stop at first error* (off by default — the point of running all is to see everything that is broken).

**Status per query** (`status.js`): `never` · `queued` · `running` · `ok` · `error` · `stopped` (timeout or row cap) · `stale` · `cancelled` · `skipped` (functions). Shown as the beads in `02A` §6.4.

**Stale** is computed, never set by hand: at run time record a fingerprint = FNV-1a hash of the member's normalised text + the fingerprints of its upstream members + the binding keys it used + the culture. A query is stale when its current fingerprint differs from the one recorded at its last successful run. Editing `Sales_Raw` therefore turns `Sales_Clean`, `Summary` and `Regions` stale at once, and the navigator and graph show it before anyone runs anything.

**The Queue tab** in the dock lists the current and last batch: each query with its bead, duration, row count, Excel verdict, and a *Cancel batch* button. Clicking a finished row opens its result. While a batch runs, the user can keep editing and browsing: **selecting an item no longer cancels a run** (remove that coupling from the old `select()`).

**Run history** (memory): the last 10 runs per query (fingerprint, status, rows, duration, resultId if still stored). The result header shows *"312 fewer rows than the previous run"* when the previous result is still in the store.

**Tests:** `T-WB-09` unit — `run-plan` orders, dedupes and skips functions; fingerprints change exactly when an upstream text changes; e2e — run all on `many-queries.xlsx`, the navigator shows the expected counts of ok/error; edit one staging query, exactly its downstream turns stale; *Run stale* runs exactly those.

---

### 6C — The shell

#### WB-10 — Workbench layout
**Build:** `src/app/workbench.js` replaces `src/app/workspace.js`; pane components in `src/ui/wb/panes.js`. CSS grid with named areas, sizes as custom properties set via CSSOM (allowed). Pane headers per `02A` §6.8. Collapse/expand each pane (`Ctrl/Cmd+B` navigator, `Ctrl/Cmd+Alt+B` inspector, `Ctrl/Cmd+J` dock). A collapsed pane leaves a 32 px rail of its own tone with its icon and an expand button, so it can be restored by pointer as well as by key. Presets from §1. Mobile mode from §1.

Focus management between regions: `F6` / `Shift+F6` cycles navigator → editor → inspector → dock → readout, landing on the last focused element in each. Focus is never lost to `<body>` (DoD).

The old `workspace.js` behaviours are kept unless an item here replaces them; list each removed behaviour in `PROGRESS.md` under *Changed expectations* with the test assertion that changed.

**Tests:** `T-WB-10` e2e — every pane resizes by keyboard and pointer, collapses and restores; F6 cycle; at 390×844 the segmented control switches regions and no region overflows horizontally.

#### WB-11 — The navigator
**Why:** this is where "many queries" is won or lost.

**Build:** `src/ui/wb/navigator.js`. A **virtualised** list (render only visible rows + overscan; 320 items must scroll at 60 fps and 3 000 must still work).

- **Two lists:** Queries and VBA (segmented control at the top; `Ctrl/Cmd+Shift+1` / `Ctrl/Cmd+Shift+2`. `Ctrl/Cmd+1/2` belong to the browser, see `02B` §7.1).
- **Row:** status bead · name (fuzzy-match ranges highlighted) · kind glyph (table / model / connection only / function `ƒ`) · row count or error code at `--t-2xs` · edited mark (ochre dot + `S.asEdited` for screen readers) · bypassed-steps count if any.
- **Group by:** Folder (the workbook's Power Query groups — read-only, D-4) · Load target · Status · **Layer** (from WB-1: *Sources* layer 0, *Staging*, *Outputs* = nothing uses them) · None. Group headers are sticky, show counts per status (`12 · 1 error · 3 stale`), and collapse.
- **Sort:** section order (default) · name · last run time · duration · rows.
- **Filter chips:** Edited · Errors · Stale · Never run · Loaded · Connection only · Functions · Linked to a macro (WB-25). Chips combine with AND; each shows its count; counts update live. The first four are always visible; the other four are behind a `+ More` chip (a checklist popover). Any active chip is always shown in the visible row (`02B` §4.10).
- **Search:** fuzzy on names. Prefix `code:` searches inside the code of every query (and module, in the VBA list) and shows the match count on each row; `Enter` opens the first match at its line. Prefix `step:` searches step names across all queries ("which queries have a `Merged Queries` step?").
- **Multi-select:** click, `Shift`+click, `Ctrl/Cmd`+click; keyboard `Space` toggles, `Shift+Arrow` extends, `Ctrl/Cmd+A` selects all visible. A **selection bar** (a floating rounded card, `02B` preview) appears at the bottom of the navigator when ≥ 2 items are selected: *Run · Run with downstream* visible, then `⋯` with *Revert · Show in graph · Print · Copy names*. All six are also in the row context menu and the palette.
- **Preview vs open:** single click previews in the *preview tab* (italic title, replaced by the next preview); double-click, `Enter`, or editing makes it a permanent tab — the VS Code pattern users already know.
- **ARIA:** grouped: `role="tree"` with `aria-multiselectable="true"`, group headers as `treeitem`s with `aria-expanded`, items as child `treeitem`s with `aria-level="2"`. Ungrouped: `role="listbox"` with `aria-multiselectable="true"`. A listbox must not be nested inside a tree (`02B` §7.3). `aria-setsize`/`aria-posinset` on virtualised rows in both, so screen readers announce real positions.

**Tests:** `T-WB-11` e2e on `many-queries.xlsx` — search `sclean` finds `Sales_Clean` first; `code:Table.Group` shows the right count; group by Layer gives the expected three groups; chip *Errors* shows exactly the broken queries; multi-select 5 → Run → exactly 5 (plus nothing else) get results; virtualisation keeps the DOM under 80 row elements; screen reader positions are correct (assert `aria-posinset`).

#### WB-12 — Tabs and split
**Build:** `src/ui/wb/tabs.js`. Open items as tabs with bead, name, edited dot, close button. Up to two editor groups side by side (`Ctrl/Cmd+\` splits; drag a tab to the other group; on mobile, no split). Each group remembers its own scroll and caret per item. Closing an edited tab does **not** discard the edit (edits live in the session, E-1), it only closes the view; say so in the tab tooltip.

Browser-reserved shortcuts cannot be taken: `Ctrl+W`, `Ctrl+T`, `Ctrl+Tab`, `Ctrl+PageUp/Down` belong to the browser in most engines. Use `Alt+W` close, `Alt+[` / `Alt+]` previous/next tab, `Alt+1…9` go to tab. Document this in the shortcut sheet (E-12) with the reason.

**Tests:** `T-WB-12` e2e — open 6 items, split, edit in both groups, close an edited tab, reopen it, the edit is still there; tab keyboard shortcuts.

#### WB-13 — Command palette
**Build:** `src/ui/wb/palette.js`, opened with `Ctrl/Cmd+K` (and `Ctrl/Cmd+Shift+P`). One fuzzy list (WB-5) over: every query, every module, every procedure (`@` prefix), every step of the current query (`#` prefix), every line (`:` prefix, go to line), and every **command** (`>` prefix) — every action in this file is a registered command with a name in `strings.js`, an optional shortcut, and an `enabled()` predicate. Disabled commands show the reason instead of hiding.

The command registry (`src/app/commands.js`) is also what the shortcut sheet, the menus and the context menus read, so a shortcut can never be documented in one place and different in another.

**Tests:** `T-WB-13` e2e — `Ctrl+K`, type `>run stale`, Enter runs stale; `@Workbook_Open` jumps into the module at the procedure; every registered command has a string and either a shortcut or none (unit, lint-like: `T-LINT-16` — every command id has `S.cmd[id]`).

---

### 6D — The query workbench

#### WB-14 — The Applied Steps panel
**Why:** the owner's sharpest ask: *see each step result.*

**Build:** `src/ui/wb/steps-panel.js`, in the inspector when a query is open. Built from WB-2 immediately on open (no run needed to see the list) and filled with results from WB-7 when run.

- **Row:** bead · kind icon · step name · delta chip · duration. Delta chip (computed in the worker against the previous table step): `−312 rows`, `+1 col`, `3 types`, `renamed 2`, `schema same`; for non-tables the value kind (`record`, `list 14`, `number`). Errors show the reason in `--madder-ink`.
- **The step cursor.** One step is current (a 3 px slate bar). The dock's Result tab always shows the current step's result. `F10` / `Shift+F10` (or `J`/`K` when the panel has focus) move it; the editor highlights the current step's span with a `--slate-soft` band in the gutter and scrolls it into view. Clicking a step in the editor's gutter, or placing the caret inside a step for 600 ms with *Follow caret* on, moves the cursor too. This is the "debugger feel" without pretending M has breakpoints.
- **Peek.** Focus or hover a step for 400 ms: a popover with its schema and first 5 rows from the store, without moving the cursor.
- **Pin a step.** Pins its result to the dock's Pinned tab (WB-16) so it survives reruns of other things.
- **Invoke a function query.** For `function` / `function-let` queries, an *Invoke* form lists the parameters (from the AST) with typed inputs; running invokes it with those literal arguments (generated M via WB-6, evaluated as a temporary member — never written to the file). Arguments are kept for the session.
- **Empty / loading / error states:** never-run (list shown, results `—`, one quiet line: `S.stepsNotRun`), running (skeleton rows from `02A` I-19, beads spinning per step as `step-result` messages arrive), parse error (list shown up to the last parseable step, the rest greyed, with the parse message).
- **Big steps:** a setting *Count rows for every step* (default on). When a step's row count would exceed `limits.stepCountRows` (default 2 000 000), the count shows `S.rowsNotCounted` instead of forcing it.

**Tests:** `T-WB-14` e2e on `chain.xlsx` — before running, 12 steps listed; after Run, every step has a bead and a delta, and the worker was asked once (assert one `run-steps` message); F10 through all steps updates the grid each time **without a new run**; peek shows 5 rows; an error in step 6 shows 6 red and dependants skipped; a function query is invoked with two arguments.

#### WB-15 — Step operations
**Why:** *reorder steps* — and everything else Excel's Applied Steps does, done safely.

**Build:** `src/ui/wb/step-ops.js` calling WB-3. Each operation is available from: the step's context menu, the palette, keyboard, and (for move) drag-and-drop.

| Operation | Keyboard (steps panel focused) | Rules |
|---|---|---|
| Move up / down | `Alt+Shift+↑` / `Alt+Shift+↓` | `canMove`; plain or rewire; refused moves explain why in the status region |
| Drag to reorder | grip on hover; drop indicator between rows | invalid drop positions are shown as such *while dragging* (computed with `canMove` for every gap) |
| Rename | `F2` | inline input; validates uniqueness; references updated |
| Insert step after | `Insert` | opens an inline mini editor pre-filled with the current step's name as input |
| Duplicate | `Ctrl/Cmd+D` | |
| Delete | `Delete` | refused if referenced and not linear |
| Bypass / restore | `B` | linear only; shows the step struck through with `S.bypassed` |
| Edit step | `Enter` | focuses the editor at the step's expression |

**Every structural operation shows a preview first** when it touches more than one step: a compact diff (E-3's `diffLines`) in a popover with *Apply* (primary) and *Cancel*. Single-step renames and bypasses apply directly.

**Undo.** Structural operations replace editor text programmatically, which breaks the textarea's native undo. So: each operation is recorded in a per-item **operation history** (memory) with label, before and after text; *Undo* appears in the status region for 10 seconds after each operation (`Ctrl/Cmd+Z` triggers it **only while the steps panel has focus**; in the editor, `Ctrl/Cmd+Z` stays native per E-12), and the item's History popover lists the last 50 operations with *Restore this version*. History never touches `original` (E-2 revert still restores the file's text exactly).

After any operation: the query re-parses, WB-1 updates the graph incrementally, the query and its downstream turn stale (WB-9), and the steps panel keeps the previous results visible but marked stale until rerun. If *Auto-run steps after structural edits* is on (default **off**, setting), the query's steps re-run.

**Tests:** `T-WB-15` e2e — reorder by keyboard and by drag on `chain.xlsx` (rewire), the saved file contains exactly that text change (T-E-10 contract over the result); a refused move announces the blocking step; bypass then restore returns byte-identical text; undo after delete; operation history restores version 3 of 5.

#### WB-16 — The result dock
**Build:** `src/ui/wb/dock.js`, tabs: **Result · Pinned · Compare · Problems · Queue · Graph · Changes**.

- **Result:** the grid (I-8) for the current step or query, header line `928 rows · 6 cols · 41 ms · step 5 of 7`, Excel verdict chip (E-8), *Pin* button, *Export* (existing exports, now per resultId).
- **Column header menu** (and `Alt+↓` on a focused header): sort, filter (values list with search, or a condition), profile, hide in view; and **"Add as a step"** for sort, filter, remove, keep, rename, change type, remove duplicates. View-only sort and filter run in the worker (`view` message) and are marked with a `S.viewOnly` chip and a *Clear* button so nobody confuses a view filter with the query's result. *Add as a step* shows the exact M from WB-6 in a popover, editable, then inserts it after the current step with `insertStepAfter` (rewired), moves the step cursor to it, and runs steps. This is the grid-to-code loop Excel hides.
- **Column profile:** a side sheet per column — count, nulls, errors, distinct (capped at 10 000, then `10,000+`), min, max, mean for numbers, length range for text, top 5 values with bars, value-type mix (a column typed `any` with numbers and text says so). Computed in the worker by pure `src/core/wb/profile.js` over a cell accessor.
- **Pinned:** a list of pinned results (query · step · when · fingerprint). Pinned results that have gone stale say so; they are kept, not refreshed.
- **Compare:** choose any two results (two steps, two pins, current vs previous run, quoin vs Excel): schema diff first (added / removed / retyped columns), then row count delta, then the first 200 differing cells by position, reusing `compare/cache-compare.js`. Side-by-side grids with synchronised scroll as an option.
- **Changes:** the E-3 dialog's content as a tab (WB-26 extends it).

**Tests:** `T-WB-16` e2e — filter a column via the header, view chip shown, *Add as a step* inserts the shown M, steps rerun, the new step's result equals the view; profile numbers on `wide.xlsx` match fixed expectations; compare two steps shows `−312 rows`; pinned survives eight other runs.

#### WB-17 — Dependency view
**Build:** two views over WB-1.

1. **Inspector list** (always visible under Steps): *Depends on* and *Used by* for the current query, each name with its bead, clickable; an *impact line*: `Editing this affects 7 queries (2 loaded to sheets)`.
2. **Graph tab** in the dock (and full-screen with `G` from the navigator): layered DAG, sources left, outputs right. Layout is pure and deterministic in `src/core/wb/graph-layout.js`: longest-path layering, then 4 sweeps of barycentric ordering to reduce crossings, then integer coordinates. Rendered as SVG built with `h()` (add an `svg()` helper to `src/ui/dom.js` that sets the SVG namespace — `dom.js` is named here). Nodes: bead, name, kind glyph; edges as quiet `--line-strong` curves; the selected node's upstream and downstream paths highlighted in `--slate`. Pan by drag or arrow keys with `Shift`, zoom with `Ctrl/Cmd+wheel` or `+`/`-`, *Fit*.
   - Large graphs: by default show the **neighbourhood** of the selection (2 levels each way); *Show all* lays out everything (320 nodes must lay out in under 200 ms).
   - Keyboard: the graph is a `role="application"` region with an accessible alternative: arrow keys move along edges (`←` upstream, `→` downstream, `↑`/`↓` between siblings), `Enter` opens, and the same information is always available as the inspector list for screen readers.
   - Node menu: Open · Run · Run with downstream · Show only this neighbourhood.
   - Cycles drawn with a `--madder` edge and listed in Problems.

**Tests:** `T-WB-17` unit on the layout (deterministic coordinates for a fixed graph; zero crossings for a tree; 320-node timing); e2e — the impact line on `many-queries.xlsx` names the right count; keyboard traversal from a source to an output; neighbourhood vs all.

#### WB-18 — Problems
**Why:** with 300 queries nobody opens each one to see if it parses.

**Build:** `src/core/wb/problems.js` (pure) + Problems tab. Computed after open in idle chunks (`requestIdleCallback` with a `setTimeout` fallback, each chunk ≤ 8 ms) and incrementally after each edit.

| Code | Severity | Source |
|---|---|---|
| `m.parse` | error | parse error, line:col |
| `m.unresolved` | error | unresolved identifier (WB-1) |
| `m.cycle` | error | dependency cycle |
| `m.unsupported` | warning | a library function quoin does not implement (from the generated name list vs `docs/m-coverage.md`): *"Runs in Excel. quoin cannot run Sql.Database."* |
| `m.external` | info | needs a source binding (WB-19) |
| `m.forwardRef` | warning | a step references a later step |
| `m.lastRun` | error | the last run of this query failed (cleared on success or edit) |
| `vba.structure` | error | WB-23 |
| `vba.encoding` | error | E-4 validation |
| `vba.duplicate` | error | duplicate procedure name in a module |
| `vba.noExplicit` | info | no `Option Explicit` |

Rows: severity glyph · item · step or procedure · line:col · message from `errorMessage`. `Enter` opens the item at the position. Filter by severity and by item kind. The readout's *Problems N* counter opens this tab.

**Tests:** `T-WB-18` unit per code; e2e — `many-queries.xlsx` has its known problems listed with correct positions; fixing a parse error removes the row within 500 ms; idle computation never produces a long task over 50 ms (PerformanceObserver).

#### WB-19 — Sources inventory
**Why:** in a batch run, being asked for a file in the middle of query 140 is a bad experience.

**Build:** `src/core/wb/sources.js` finds, statically, calls to `File.Contents`, `Web.Contents`, `Folder.Files`, `Folder.Contents`, `Excel.Workbook`, `Csv.Document`, `Json.Document`, `Xml.Tables` and the database connectors, with their literal arguments. **The key shown and bound must be the same key the engine uses when it raises `NeedBinding`** — read `src/core/m/runtime.js` to see how keys are formed and reuse that function (export it if needed; that small export is allowed under WB-7). Non-literal arguments are listed as *dynamic — will be asked at run time*.

UI: a *Sources* section in the overflow menu and the palette: each source, the queries that use it, its current binding, *Choose file…*, *Clear*. *Run all* first checks for unbound literal sources and offers to bind them up front (or run anyway: those queries end with the existing DataSource error, the batch continues).

**Tests:** `T-WB-19` unit on detection; e2e on `sources.xlsx` — bind 3 files up front, *Run all* asks zero questions.

---

### 6E — Editor intelligence

#### WB-20 — Completion, signature help, definition, references
**Build:**
- **Names:** `scripts/build-names.mjs` generates `src/ui/wb/m-names.js` from the library at build time: function name, parameter names, optional flags, and a one-line category. `T-WB-20a` (unit) asserts the generated file matches `LIB` exactly, so it cannot drift.
- **Completion** (`Ctrl+Space`, and automatically after `.` in a library prefix or after typing 2 identifier characters): steps in scope before the caret, query names, library functions, `each`/`let`/`in`/`if` keywords, column names of the current step's input **when its result is in the store** (inside `[` … `]`). Fuzzy-ranked (WB-5). Inserts quoted names via `quoteIdent`. A `role="listbox"` popup tied to the textarea with `aria-activedescendant`.
- **Signature help** inside a call: parameters with the current one emphasised.
- **Go to definition:** `F12` or `Ctrl/Cmd`+click on a name — a step jumps to its binding; a query opens its tab; a library function shows its signature.
- **Find references:** `Shift+F12` — every reference to the name under the caret across all queries (token-accurate), in a References list in the dock.
- **Rename step:** `F2` in the editor on a step name = WB-15 rename.
- **Rename query:** not available (D-4); `F2` on a query name explains why in the status region.

All of this runs on the main thread over WB-1/WB-2 indexes; nothing evaluates code. The overlay positions come from the existing editor's measurement (the highlight layer); if the editor cannot report caret coordinates, add that to `src/ui/editor.js` (named here).

**Tests:** `T-WB-20` e2e — completion inside `[` offers the input step's columns after a run; F12 on a query name opens it; Shift+F12 lists exact reference counts; completion popup is announced and dismissable with Escape.

#### WB-21 — Find and replace across the workbook
**Build:** `Ctrl/Cmd+Shift+F` find, `Ctrl/Cmd+Alt+F` replace (`Ctrl/Cmd+Shift+H` is taken by the browser, `02B` §7.1), a panel in the dock. Scope: all queries, all modules, the selection in the navigator, or the current item. Options: match case, whole word, regular expression, **code only** (skip comments and string literals — uses the lexer for M and the WB-4 scanner for VBA). Results grouped by item with line previews and match highlights.

Replace shows every match with a checkbox and a live diff; *Replace selected* applies all chosen matches as one operation per item (WB-15's history) and one E-1 change per item. Replacing never touches an item that is read-only (locked VBA, unparseable mashup) — those matches are listed as skipped with the reason.

User regular expressions are run in chunks with a 50 ms budget per chunk and a total cap of 20 000 matches; an invalid expression shows its error under the field.

**Tests:** `T-WB-21` e2e — find `Sales` code-only skips the comment hit; replace in 3 of 5 matches changes exactly 3; regex error shown; locked module skipped with reason.

---

### 6F — The VBA workbench

#### WB-22 — Outline and navigation
**Build:** for an open module, the inspector shows **Outline** (from WB-4): options, declarations, then procedures with kind icon, scope, parameters, and badges *entry point* / *event: Workbook Open*. Click or `Enter` jumps; the editor shows a **breadcrumb** (`Module1 › Sub RefreshSales`) that follows the caret, and a procedure dropdown like the VBE's, but searchable.

The navigator's VBA list groups modules by kind (Document, Standard, Class, Form) and can expand each module to its procedures, so `@RefreshSales` and the tree both reach a procedure directly. *Focus procedure* (`Ctrl/Cmd+Shift+.`) folds the editor view to the current procedure (view only).

**Per-procedure change tracking:** procedures are matched between the original and current text by kind + name; the outline marks edited procedures, and each has *Diff* and **Revert this procedure** (replaces only that procedure's line range with its original). E-2's three revert scopes become four.

**Tests:** `T-WB-22` e2e on `vba-big.xlsm` — the outline lists the expected procedure count; breadcrumb follows the caret; revert one of two edited procedures leaves the other edited.

#### WB-23 — Structure checks
**Build:** in `outline.js`, a block-balance pass: `Sub/Function/Property … End`, block `If … End If` (single-line `If … Then x` excluded), `For … Next`, `For Each … Next`, `Do … Loop`, `While … Wend`, `With … End With`, `Select Case … End Select`, `Type … End Type`, `Enum … End Enum`. Report the first mismatch per block with the opening line and the found closing line: *"For on line 40 is closed by End If on line 52."* Also duplicate procedure names and `Exit Function` inside a `Sub`. Run on edit (debounced 300 ms, like E-4) with gutter markers. These are checks; **saving is not blocked by them** (E-4 still blocks on encoding and size), but the Download button's tooltip and the Changes review list them.

**Tests:** `T-WB-23` unit — each block type balanced and unbalanced; nested; single-line `If`; labels and `:` separators.

#### WB-24 — References and call graph
**Build:** `src/core/vba/refs.js`: token-level identifier scan across all modules (outside comments and strings) matched against public procedures (any module) and private procedures (same module), plus `Application.Run "Name"` / `"Module.Name"` string calls. Produces callers/callees per procedure.

UI: *Find references* (`Shift+F12`) and *Go to definition* (`F12`) in VBA modules; a **Calls** section in the inspector (*Calls* / *Called by*); procedures with no callers are marked *no callers found* with the honest note `S.vbaNoCallersNote` (*"It may be run from a button, a shape, another workbook or the Macros dialog."*). The dock's Graph tab gains a VBA mode using the same layout (WB-17).

**Tests:** `T-WB-24` unit — a call through `Call X`, bare `X arg`, `X(arg)` in an expression, `Application.Run "Module2.X"`, a same-named local variable is not a call; e2e — callers listed for a known procedure.

#### WB-25 — Macro → query links, and running them for real
**Why:** this is the honest version of "run VBA better than Excel": most workbook macros that touch Power Query exist to refresh queries in an order.

**Build:** `src/core/vba/pq-links.js` scans each procedure for:

| Pattern | Resolves to |
|---|---|
| `.Connections("Query - Name").Refresh` / `.OLEDBConnection.Refresh` | query `Name` |
| `.ListObjects("Table1").QueryTable.Refresh` / `.Refresh` | the query loaded to table `Table1` (via `q.load.tableName`) |
| `.Queries("Name")` (read or modify) | query `Name`, marked *reads or modifies the query* |
| `.RefreshAll` | every loaded query |
| a non-literal argument | *dynamic — cannot be resolved without running VBA* |

UI: in the VBA outline, a procedure with links shows a **Refreshes** list (in source order); in the query navigator, the chip *Linked to a macro*; on a query, the inspector shows *Refreshed by: Module1.RefreshSales*. A procedure with links has **Run these queries** (a secondary button in the outline, because the top bar's Run is already this layer's one filled button (`02B` §3.2); it also appears in the Run split menu as *Run this macro's queries* while that procedure is current): it runs the resolved queries **in the macro's order** as one batch (WB-9), and the Queue tab is headed `S.runForMacro(name)` with a quiet line: *"Runs the queries this macro refreshes. The rest of the macro does not run."*

**Tests:** `T-WB-25` unit on every pattern including `With ThisWorkbook.Connections("Query - A")` blocks and line continuations; e2e on `macro-refresh.xlsm` — *Run these queries* runs exactly the resolved queries in order, dynamic ones are listed as unresolved.

---

### 6G — Proof

#### WB-26 — Changes review, workbench edition
Extend E-3: Changes groups by query and module, and for queries adds a **step-level summary** computed by `src/core/wb/step-diff.js` (pure, comparing original and current `stepsOf` by name and expression): *Steps reordered: Filtered Rows moved above Changed Type · Step added: Removed Duplicates · Step bypassed: Grouped*. For modules: *Procedures changed: RefreshSales, Init*. Then the unified diff as before. WB-23 structure findings and WB-18 errors for changed items are listed at the top. P-12 prints this view. The print preview (Phase 4) accepts the navigator selection as "what to print".

**Test:** `T-WB-26` unit on `step-diff`; e2e — after reorder + insert + bypass, the summary lists exactly those three.

#### WB-27 — Performance budgets
Measured in Chromium in e2e with `performance.now()` and a `PerformanceObserver({ type: 'longtask' })`. CI may apply a ×2 factor; record raw numbers in `PROGRESS.md`.

| Scenario | Budget |
|---|---|
| Open `many-queries.xlsx` (320 queries, 60 modules) → navigator interactive | ≤ 1 500 ms |
| Problems scan complete after open, in the background | ≤ 3 000 ms, no long task > 50 ms |
| Keystroke in navigator search → list updated (320 items) | ≤ 50 ms |
| Select a query → editor, steps list (static) and dependency list shown | ≤ 100 ms |
| Run steps of a 12-step query vs a plain run of the same query | ≤ 1.3 × |
| Run all → first `member-result` rendered | ≤ 500 ms after the first member finishes in the worker |
| Step cursor move (result already stored) → grid shows the step | ≤ 50 ms |
| Graph layout, 320 nodes | ≤ 200 ms |
| Any interaction above | no main-thread task > 100 ms |

**Test:** `T-WB-27` e2e, one assertion per row.

#### WB-28 — Visual baseline and the acceptance story
**Visual:** eight more states, each at 1280×800 and 390×844, light and dark (32 screenshots), Glaze palette, same stability rules as `02` I-16. **Look at every one.**
11. Navigator grouped by Layer with search active on `many-queries.xlsx`. 12. Steps panel after a run, cursor on step 5, peek open. 13. Result dock with a view filter chip and the *Add as a step* popover. 14. Dependency graph, neighbourhood of a staging query. 15. Problems tab with 4 rows. 16. Queue during *Run all*. 17. VBA module with outline, breadcrumb and a structure error. 18. Command palette with `>run`.

**The acceptance story** — `T-WB-28`, one e2e test, and the script the owner uses to judge the phase by hand:

1. Open `many-queries.xlsx`. The navigator shows 320 queries in groups within 1.5 s; Problems shows 4.
2. Type `sales` in the navigator search; 9 queries remain. Filter *Errors*: 1 remains. Open it; the parse error is marked in the gutter; fix it; Problems shows 3.
3. *Run all*. The Queue fills progressively; the navigator beads change as results arrive; the readout ends with counts.
4. Open `Sales_Clean`. The Steps panel shows 7 steps with deltas. Press `F10` five times; the grid follows each step with no new run.
5. In the grid, filter `Region` to `North` via the header; choose *Add as a step*; the M shown is inserted; steps rerun.
6. Move the new step above `Changed Type` with `Alt+Shift+↑`; the preview diff appears; apply.
7. The readout shows `Stale 3`; the graph shows `Summary` and `Regions` stale. *Run stale* runs exactly those.
8. Switch to VBA, open `Module1`, select `RefreshSales` in the outline; *Run these queries* runs its 3 queries in order.
9. Open Changes: one query with *Step added*, *Steps reordered*; the diff is correct.
10. Save (download path). The saved file passes the T-E-10 contract and reopens with all edits.

Focus is never on `<body>` after any step, and there are no console errors or CSP violations.

---

## 5. New tests and fixtures

### 5.1 Test IDs

| ID | Kind | Proves |
|---|---|---|
| T-WB-01 | unit | dependency index, scoping, cycles, incremental update, timing |
| T-WB-02 | unit | step model over generated, hand-written, commented, function queries |
| T-WB-03 | unit | every let-block transform; refusals; byte-exact untouched text |
| T-WB-04 | unit | VBA outline scanner |
| T-WB-05 | unit | fuzzy matcher ranking and timing |
| T-WB-06 | unit | M generation; generated code runs |
| T-WB-07 | unit | one-pass steps; batch shares upstream; results equal `runOnce` |
| T-WB-08 | unit + e2e | result store eviction; pins survive; cancel drops store honestly |
| T-WB-09 | unit + e2e | run plans, fingerprints, stale propagation, *Run stale* |
| T-WB-10 | e2e | layout, panes, F6, mobile regions |
| T-WB-11 | e2e | navigator search, `code:`/`step:`, groups, chips, multi-select, virtualisation, ARIA positions |
| T-WB-12 | e2e | tabs, split, edits survive closing |
| T-WB-13 | e2e | palette prefixes and commands |
| T-LINT-16 | lint | every command id has a string; no shortcut defined twice; no command uses a reserved browser shortcut (`02B` §7.1) |
| T-V-02, T-V-07 | unit, e2e | every command has a T1–T3 surface and renders there (`02B` §6) |
| T-WB-14 | e2e | steps panel, cursor without rerun, peek, error skipping, invoke |
| T-WB-15 | e2e | step operations, preview, undo, history, saved-file contract |
| T-WB-16 | e2e | view filter, add as step, profile, compare, pins |
| T-WB-17 | unit + e2e | graph layout determinism and timing; impact; keyboard traversal |
| T-WB-18 | unit + e2e | problems codes, positions, incremental update, no long tasks |
| T-WB-19 | unit + e2e | sources detection; zero questions after binding up front |
| T-WB-20a | unit | generated name list equals the library |
| T-WB-20 | e2e | completion, signature, definition, references |
| T-WB-21 | e2e | find/replace across workbook, code-only, regex errors, read-only skip |
| T-WB-22 | e2e | VBA outline, breadcrumb, procedure revert |
| T-WB-23 | unit | VBA block balance |
| T-WB-24 | unit + e2e | VBA references and callers |
| T-WB-25 | unit + e2e | macro → query links; run in macro order |
| T-WB-26 | unit + e2e | step-level change summary |
| T-WB-27 | e2e | performance budgets |
| T-WB-28 | e2e | 32 visual snapshots and the acceptance story |
| T-I-08 | unit | no token above OKLCH chroma 0.12 (`02A`) |

### 5.2 Fixtures (generated by `tests/fixtures/generators/build.js`; extend it, do not commit what it can make)

| Fixture | Contains | Used by |
|---|---|---|
| `many-queries.xlsx` | 320 queries in 12 groups, 5 dependency layers, 40 function queries, 30 loaded to tables, exactly 4 known problems (1 parse error, 1 unresolved, 1 cycle pair, 1 unsupported connector), 9 names containing `Sales`; 60 VBA modules if the generator supports `.xlsm`, else a sibling `many-queries.xlsm` | WB-1, 9, 11, 17, 18, 27, 28 |
| `chain.xlsx` | `Sales_Clean`: 7 UI-style linear steps; `Long_Chain`: 12 linear steps; `Mixed`: non-linear steps with comments in every position | WB-2, 3, 7, 14, 15, 26 |
| `step-error.xlsx` | an error in step 6 of 10, with two independent later steps | WB-7, 14 |
| `fn-invoke.xlsx` | a 2-parameter function query with a `let` body | WB-14 |
| `sources.xlsx` | 3 literal `File.Contents` paths shared by 5 queries, 1 dynamic path | WB-19 |
| `vba-big.xlsm` | 60 modules (standard, class, document), ~900 procedures, one structure error, one duplicate name | WB-4, 22, 23, 24 |
| `macro-refresh.xlsm` | procedures using every WB-25 pattern, one dynamic | WB-25, 28 |
| `cycle.xlsx` | A → B → A | WB-1, 18 |

---

## 6. What this phase does not build

Write these into `docs/decisions.md` so they are not attempted later:

- **Executing VBA** (G-4, D-3).
- **Adding, renaming, deleting queries, or editing query groups** (D-4): these touch the DataMashup metadata and other parts that G-5 protects.
- **A visual query designer** (drag-a-merge-dialog style): the grid-to-step actions in WB-16 are the whole UI-generates-code surface. More would be a second product.
- **An M formatter / pretty-printer**: re-serialising M risks changing semantics and destroys the user's formatting; quoin's rule is to change only the text that must change.
- **A cross-run value cache.** `evaluateMany` already shares upstream work inside a batch; caching across runs needs invalidation the engine was not built for.
- **Parallel workers** (D-2).
- **Breakpoints.** M is lazy; the step cursor is the honest equivalent.
- **Persisting anything new** beyond what D-1 may allow.
- **AI features, network sources, live data refresh.** G-2.

---

## 7. Handover prompt for the implementing model

Paste this when starting Phase 6:

> You are continuing quoin (`datakid/power-query-manager`, branch `beta`). Phases 0–3 of `plan/` are done (check `docs/next/PROGRESS.md`). Read `plan/00_START_HERE.md`, `plan/02A_IDENTITY_AMENDMENT.md`, `plan/02B_VISUAL_REFINEMENT.md` and `plan/06_WORKBENCH.md` completely before writing code, and open `plan/assets-v2/refined-preview.html` in a browser. If I-R or I-V are not done yet, do them first. Every control in `02B` §5 must exist when you finish; calm comes from hierarchy and spacing, never from removing a feature. Follow every guardrail in `00` §2 and the exceptions in `06` §2.1 only. Work in the order of `06` §3: models (6A) first, all unit-tested in Node before any UI exists. One item letter per commit. Run `npm test` at the end of every sub-phase. Take and look at screenshots for every UI item, both themes, both widths. When something in the plan is ambiguous, choose what preserves the user's file and the byte-preservation guarantee, write it under *Deviations*, and continue. Stop and report after 6B so the owner can try steps and batch runs before the shell is rebuilt.

**Cost advice:** 6A and 6B are the foundation and the highest-value part per token: once the step model, the let-block transforms and the one-pass evaluation exist, even the current UI can show every step instantly. If budget is tight, do 6A + 6B + WB-14 + WB-15 first — that alone delivers *see each step* and *reorder steps*. Then 6C/6D for *many queries*, then 6F for VBA, then 6E.
