# TC Analyzer — what changed

Rebuilt from the original repo (`japsaini0/TCAnalyzer`). Every file is included in the zip so you can
drop it straight into the repo — nothing is missing.

## New UI

| | Before | Now |
|---|---|---|
| Theme | Neon purple/pink glassmorphism on black, particle canvas | **Light-first, low-chrome devtool look** with an optional dark theme. Teal accent, hairline borders, subtle grid backdrop, no particles |
| Layout | Two floating glass panels, cramped controls | **Workspace layout**: editor card (with real console docked under it) + complexity card. Full-width history rows |
| Typography | Inter everywhere, emoji-heavy headers | Inter for UI, **JetBrains Mono** for all code/metrics, sentence-case labels, uppercase micro-labels |
| Editor | Font-size mismatch between gutter & code, gutter never scrolled | Shared metrics, **synced scrolling**, line numbers actually line up (0px drift, verified at 1440px & 390px) |
| Console | Emoji status dots, output only | Proper terminal strip: status dot, exit chip, Output/Stdin tabs |
| Results | One big gradient badge + generic cards | Hero complexity figure, **2×2 stat grid** (best/average/worst/space), benchmark strip, "Why" + "Optimisation" blocks |
| History | Grid of cards, `undefined UNDEFINED` rows | Compact rows with complexity chip, language tag, runtime, time |
| Mobile | Template/Clear/Copy buttons clipped off-screen | All controls fit; verified no horizontal overflow at 390px |
| Motion | Always on | Respects `prefers-reduced-motion` |
| A11y | No labels, emoji-only theme toggle | `aria-label`/`aria-pressed`/`role=tab`, `aria-live` console, visible focus rings, WCAG-AA text colours |

Screenshots are in `screenshots/`.

---

## Bugs fixed (all verified with Playwright against the rebuilt app)

### Big-O engine (`analyzer.js`)

| Bug | Before | After |
|---|---|---|
| Memoisation sniffed across the **whole file** | `!= -1`, `visited`, `dp`, or a comment `// cache` anywhere turned **O(2^n) into O(n)** | Signals scoped to the recursive function's body + decorators. Naive fib with a stray `!= -1` now correctly reports `O(2^n)` |
| Word "graph" + a queue forced `O(V+E)` | Any nested loop mentioning `graph` reported `O(V+E)` | Requires an actual traversal: `while(!q.empty())` **and** adjacency iteration. Nested double loop now → `O(n²)`, real BFS still → `O(V+E)` |
| Binary search using `l`/`r`/`m` reported `O(n)` | Only `mid`/`middle` names matched | Added pivot-agnostic patterns — `int m = l+(r-l)/2` now → `O(log n)` |
| Auxiliary space ignored generic containers | `seen = {}`, `out = []`, `.append()` → `O(1)` space | Container allocation detected → `O(n)`. Two-sum now correctly `O(n)` time **and** space |
| Auto-detect compiled plain **C as C++** | `#include <stdio.h>` + `malloc` → sent to g++, which rejects `void*` conversion | C headers/IO without C++-only constructs now resolve to `c` |
| "Pseudocode" analysed as **O(1)** and later run as Python | No pseudocode grammar; `pseudo` silently executed on CPython | New indentation-based pseudocode loop parser (`FOR … TO … DO`, `WHILE … DO`, `REPEAT`) → correct `O(n)`, `O(n²)`, … **and** execution is blocked with a clear message |
| Gibberish accepted | `🏆🏆🏆` analysed as `O(1)` | Rejected with "Not enough code to analyse" |

### Execution (`runner.js`)

| Bug | Before | After |
|---|---|---|
| Infinite loop froze the tab | `new Function()` + Pyodide ran on the main thread; `while(true){}` killed the page | **JS runs in a Web Worker**, Pyodide runs in a worker too. 5 s wall-clock limit, worker `terminate()` → tab stays alive (verified: recovers in ~5.0 s) |
| Python stdin worked once | `_stdinLines` never reset → 2nd run threw `EOFError` | Fresh stdin queue per run. Verified: `sum = 59` twice |
| Python globals leaked between runs | Shared `pyodide.globals` | Fresh namespace dict every run + destroyed after. Verified: old variables now raise `NameError` |
| Async `console.log` lost | Output captured synchronously, restored in `finally` | Worker flushes microtasks + timers before reporting. `setTimeout`/`Promise` logs now appear |
| `/api/run` 404 on every production run | Endpoint never shipped (only exists in `serve.js`) | Only tried on `localhost`/`127.0.0.1`. No more wasted round-trip in production |
| Java `public class Solution` failed | Wandbox writes `prog.java` | `public` stripped from top-level classes before sending |
| Stdin ignored for JS | `require`/`readFileSync` unavailable | Worker provides `input()`, `readLine()`, `prompt()`, `readAll()`, and a clear error for `require` |
| Timeout message lied | Said 18 s, aborted at 16 s, never applied locally | Single source of truth: 5 s local, 20 s remote, message matches |

### App (`app.js`)

| Bug | Before | After |
|---|---|---|
| Corrupt localStorage **bricked the app** | Un-guarded `JSON.parse` at load aborted the IIFE — no handlers attached | Safe `store` wrapper with try/catch + self-healing. App always boots |
| History truncated code to 500 chars and silently loaded the stump | 42-line file reopened as 9 lines | Stores up to 20 000 chars, flags truncation, warns when loading |
| Example click left stale results | Panel kept the previous language + complexity | Loading code always re-analyses |
| Live Big O **off** ⇒ Run never updated metrics | Panel froze | Explicit runs always refresh results (with benchmark) |
| Clear button left `O(n²)` on screen | No reset | `resetResults()` |
| History card didn't restore its language | Python code opened with C++ selected | Language restored |
| Race: slow run overwrote a newer one | No request token; Shift+Enter bypassed the disabled button | Monotonic `runSeq` + `isRunning` guard → double Shift+Enter fires once |
| Failed analyses logged as `undefined UNDEFINED` | History written even when `result.error` | Errors are never stored |
| `NaN / ∞ executions` | `parseInt` of garbage | `Number.isFinite` guard, key renamed to `tc_runs` |
| Toasts cut each other off | Single shared timer | Toast stack (max 4, individual lifetimes) |
| Copy said "copied" even when blocked | Promise ignored | Awaits clipboard, `execCommand` fallback, real error toast |
| Chart not redrawn on theme change | Only on tab switch/resize | Redraws on theme change + resize (debounced) |
| Editor content lost on reload | Nothing persisted | Draft autosave (code + language + stdin) |
| Template/example replaced code with no undo | Programmatic `.value` kills native undo | One-step custom undo (Ctrl+Z restores, toast tells you) |
| Not announced to screen readers | — | Tab ARIA, `aria-live` console, labelled controls |

### Static / platform

* `index.html` — semantic markup, `<meta name="description">`, canonical, **Open Graph + Twitter cards**, themed favicon, `theme-color`, labelled select, `aria-*` on tabs.
* `styles.css` — full rewrite (design tokens, light + dark, responsive breakpoints, reduced-motion, print).
* `vercel.json` — **CSP** (`wasm-unsafe-eval` + jsDelivr + blob workers), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, plus predictable caching.
* `robots.txt` + `sitemap.xml` — both were 404.
* `serve.js` — `HOST` env var so it can bind `0.0.0.0` (containers/preview); unchanged behaviour otherwise.
* Removed the 5.3 MB upfront Pyodide pre-warm — Python runtime now loads on first Python run with a status message.

---

## Files

| File | Status |
|---|---|
| `index.html` | rewritten |
| `styles.css` | rewritten |
| `app.js` | rewritten |
| `runner.js` | rewritten |
| `analyzer.js` | patched (7 targeted fixes, rest untouched) |
| `serve.js` | one-line change (`HOST`) |
| `test_regression.js` | unchanged — still 43/43 passing |
| `vercel.json` | **new** |
| `robots.txt`, `sitemap.xml` | **new** |
| `screenshots/` | **new** |

## Still open (needs decisions from you)

1. **Deploy** — push these files; the production site still runs the old build.
2. **JS on Wandbox** — the "JavaScript" option runs in your browser. If you want real Node semantics (`require`, stdin via `fs`), route JS through Wandbox `nodejs-20.17.0` instead. One-line change if you want it.
3. **CSP `'unsafe-eval'`** is required because the JS sandbox compiles user code. Moving to a non-eval runner isn't possible in-browser without a parser; the worker already isolates it.
