TC Analyzer — 5-file delivery bundle
====================================
Repo: https://github.com/japsaini0/TCAnalyzer
Live: https://www.tcanalyzer.tech/
Built: 14 Nov 2026

Verified: repo regression 43/43, engine suite 87/87, browser suite 76/76,
theme suite 14/14. Engine check on the packaged analyzer.js: 10/10 correct.

--------------------------------------------------------------------------
CHANGE IN THIS BUILD: DARK BY DEFAULT
--------------------------------------------------------------------------
The site now opens in a dark theme. The background is charcoal (#15181e),
not the near-black (#0b0e13) used previously — it is easier on the eyes for
long sessions and keeps the card/elevation steps distinguishable at low
brightness. Light theme is still there, behind the toggle top-right, and the
choice persists across reloads.

Changed for this: styles.css (dark palette), index.html (data-theme="dark",
theme-color meta), app.js (default + theme-color sync).

--------------------------------------------------------------------------
01-full-project.zip        ← START HERE if you just want to fix/redeploy
--------------------------------------------------------------------------
The complete project, every file, changed or not. Drop into the repo root.

  index.html        dark by default                     ← NOT yet deployed
  styles.css        charcoal dark palette              ← NOT yet deployed
  app.js            dark default + Esc-to-cancel        ← NOT yet deployed
  runner.js         90s remote budget, cancel(), abort fix   ← NOT yet deployed
  analyzer.js       Go/Rust loop fixes                  ← NOT yet deployed
  serve.js          HOST env var
  vercel.json       CSP + security headers
  robots.txt, sitemap.xml
  test_regression.js  43/43 passing
  CHANGES.md, screenshots/

FILES NEEDING DEPLOY: analyzer.js, runner.js, app.js, index.html, styles.css

--------------------------------------------------------------------------
02-changed-files-only.zip
--------------------------------------------------------------------------
Just what changed vs upstream, for review before you commit.

  changes.patch   git apply -p1 changes.patch
                  (verified: applies cleanly against upstream 17f2265 and
                   reproduces every file byte-for-byte)
  README.txt      what changed and why
  the changed files themselves

--------------------------------------------------------------------------
03-engine-and-tests.zip
--------------------------------------------------------------------------
The Big-O engine in isolation plus the harness that found the bugs.

  analyzer.js         the patched engine (87/87)
  test_regression.js  repo's own suite (43/43)
  reference-runner.js runner.js with the remote-timeout fix
  verify/             11 Node/Playwright scripts, all accept TARGET=<url>

  engine_suite.js          87 engine assertions
  node_engine_check.js     10 canonical loop forms, no browser needed
  live_engine_probe.js     the O(1) bug, in the real UI
  live_remote_symptom.js   Go/Rust timeout, in the real UI
  remote_langs.js          all 5 compiled languages end-to-end
  cancel_check2.js         Esc cancel + timeout-no-retry (deterministic)
  browser_suite.js         76 UI checks
  python_suite.js          10 Pyodide checks
  crossbrowser_suite.js    8 checks x Chromium + Firefox
  final_checks.js          long lines, disabled states, page errors
  theme_suite.js           14 theme/contrast/persistence checks

  Run: TARGET=https://www.tcanalyzer.tech/ node verify/engine_suite.js
  Needs: npm i playwright@1.48.0; npx playwright install chromium firefox;
         apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0
         libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3
         libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0

--------------------------------------------------------------------------
04-reports.zip
--------------------------------------------------------------------------
  BUG-REPORT.md        original 26-finding audit of the live site
  LIVE-VERIFICATION.md the hard-test report: what passed, what's broken in
                       production right now, and the evidence
  CHANGES.md           full changelog, bug by bug

  READ LIVE-VERIFICATION.md FIRST — it has the A/B proof that the deployed
  site scores Go `for i := range a` and Rust `for x in v.iter()` as O(1),
  while the fixed build scores both O(n).

--------------------------------------------------------------------------
05-screenshots.zip
--------------------------------------------------------------------------
  Five PNGs of the dark design (2x): playground, light-for-comparison,
  examples, Big O guide, mobile at 390px.

--------------------------------------------------------------------------
THE ONE THING TO DO
--------------------------------------------------------------------------
Deploy analyzer.js, runner.js, app.js, index.html, styles.css.

That single action:
  - switches the site to the dark theme
  - fixes Go and Rust being scored O(1)
  - makes Go and Rust actually run (they currently fail after 40.8s, always)
  - adds Esc-to-cancel
