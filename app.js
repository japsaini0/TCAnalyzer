/**
 * TC Analyzer — application logic
 *
 * Flows: tabs · theme · editor · live analysis · execution · history · examples · guide
 */

(function () {
    'use strict';

    /* ================================================================
       Dependencies
       ================================================================ */

    const analyzer = new ComplexityAnalyzer();
    const runner = typeof CodeRunner !== 'undefined' ? new CodeRunner() : null;

    /* ================================================================
       Tiny helpers
       ================================================================ */

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** localStorage that can never throw or hand back corrupt data. */
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                return JSON.parse(raw);
            } catch (_) {
                try { localStorage.removeItem(key); } catch (__) {}
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
        },
        del(key) {
            try { localStorage.removeItem(key); } catch (_) {}
        },
    };

    const debounce = (fn, ms) => {
        let t = null;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    /* ================================================================
       Elements
       ================================================================ */

    const codeInput = $('#codeInput');
    const gutter = $('#lineNumbers');
    const runBtn = $('#runBtn');
    const runAnalyzeBtn = $('#runAnalyzeBtn');
    const analyzeBtn = $('#analyzeBtn');
    const liveToggle = $('#liveToggle');
    const templateBtn = $('#templateBtn');
    const clearBtn = $('#clearBtn');
    const copyBtn = $('#copyBtn');
    const languageSelect = $('#languageSelect');
    const resultsBody = $('#resultsBody');
    const copyResultBtn = $('#copyResultBtn');
    const charCount = $('#charCount');
    const lineCount = $('#lineCount');
    const queryCount = $('#queryCount');
    const themeToggle = $('#themeToggle');
    const historySection = $('#historySection');
    const historyGrid = $('#historyGrid');
    const clearHistoryBtn = $('#clearHistoryBtn');
    const examplesGrid = $('#examplesGrid');
    const learnGrid = $('#learnGrid');
    const chartLegend = $('#chartLegend');

    const terminalOutput = $('#terminalOutput');
    const stdinInput = $('#stdinInput');
    const statusDot = $('#termStatusDot');
    const metaChip = $('#termMetaChip');
    const copyTermBtn = $('#copyTermBtn');
    const clearTermBtn = $('#clearTermBtn');
    const consoleTabs = $$('.console-tab');
    const paneOutput = $('#termPaneOutput');
    const paneStdin = $('#termPaneStdin');

    /* ================================================================
       State
       ================================================================ */

    let totalRuns = Number(store.get('tc_runs', 0));
    if (!Number.isFinite(totalRuns) || totalRuns < 0) totalRuns = 0;

    let history = store.get('tc_history', []);
    if (!Array.isArray(history)) history = [];

    let lastMetrics = null;
    let isRunning = false;
    let runSeq = 0;
    let undoBuffer = null;

    const DRAFT_KEY = 'tc_draft';

    /* ================================================================
       Theme
       ================================================================ */

    function applyTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', next === 'dark' ? '#15181e' : '#ffffff');
        themeToggle.setAttribute('aria-pressed', String(next === 'dark'));
        themeToggle.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        store.set('tc_theme', next);
        if ($('#tab-learn').classList.contains('is-active')) drawChart();
    }

    applyTheme(store.get('tc_theme', 'dark'));

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    /* ================================================================
       Toasts (queued — the old single timer cut messages off)
       ================================================================ */

    const toastStack = $('#toastStack');

    function toast(message, kind = 'info') {
        if (!toastStack) return;
        while (toastStack.children.length >= 4) toastStack.firstElementChild.remove();

        const node = document.createElement('div');
        node.className = 'toast' + (kind === 'err' ? ' is-err' : kind === 'ok' ? ' is-ok' : '');
        node.innerHTML = '<span class="toast-dot"></span><span></span>';
        node.lastElementChild.textContent = message;
        toastStack.appendChild(node);

        setTimeout(() => {
            node.classList.add('is-out');
            setTimeout(() => node.remove(), 200);
        }, 3200);
    }

    /* ================================================================
       Clipboard (awaits the promise, falls back for http://)
       ================================================================ */

    async function copyText(text, okMessage) {
        if (!text || !text.trim()) {
            toast('Nothing to copy yet', 'err');
            return;
        }
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            toast(okMessage || 'Copied', 'ok');
        } catch (_) {
            toast('Clipboard blocked by the browser', 'err');
        }
    }

    /* ================================================================
       Tabs
       ================================================================ */

    $$('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach((b) => {
                b.classList.remove('is-active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('is-active');
            btn.setAttribute('aria-selected', 'true');

            $$('.tab-panel').forEach((p) => p.classList.remove('is-active'));
            const panel = $(`#tab-${btn.dataset.tab}`);
            if (panel) panel.classList.add('is-active');

            if (btn.dataset.tab === 'learn') {
                requestAnimationFrame(drawChart);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    /* ================================================================
       Console tabs
       ================================================================ */

    function showConsoleTab(name) {
        consoleTabs.forEach((t) => {
            const active = t.dataset.termTab === name;
            t.classList.toggle('is-active', active);
            t.setAttribute('aria-selected', String(active));
        });
        paneOutput.classList.toggle('is-active', name === 'output');
        paneStdin.classList.toggle('is-active', name === 'stdin');
        if (name === 'stdin') stdinInput.focus();
    }

    consoleTabs.forEach((tab) => {
        tab.addEventListener('click', () => showConsoleTab(tab.dataset.termTab));
    });

    function setStatus(state, text) {
        statusDot.className = 'status-dot ' + (state === 'running' ? 'is-running' : state === 'ok' ? 'is-ok' : state === 'err' ? 'is-err' : 'is-idle');
        if (text) {
            metaChip.hidden = false;
            metaChip.className = 'console-chip ' + (state === 'ok' ? 'is-ok' : state === 'err' ? 'is-err' : 'is-running');
            metaChip.textContent = text;
        } else {
            metaChip.hidden = true;
        }
    }

    /* ================================================================
       Editor
       ================================================================ */

    function updateMeta() {
        const value = codeInput.value;
        const lines = value.split('\n');
        charCount.textContent = value.length;
        lineCount.textContent = lines.length;
        const word = document.querySelector('#lineWord');
        if (word) word.textContent = lines.length === 1 ? 'line' : 'lines';

        gutter.textContent = lines.map((_, i) => i + 1).join('\n');
        gutter.scrollTop = codeInput.scrollTop;
    }

    codeInput.addEventListener('input', () => {
        undoBuffer = null;
        updateMeta();
        saveDraft();
        if (liveToggle.checked) scheduleLive();
    });

    codeInput.addEventListener('scroll', () => {
        gutter.scrollTop = codeInput.scrollTop;
    });

    const saveDraft = debounce(() => {
        store.set(DRAFT_KEY, {
            code: codeInput.value,
            language: languageSelect.value,
            stdin: stdinInput.value,
        });
    }, 400);

    /* ---------- smart typing ---------- */

    const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };

    function insertAtCursor(text, cursorOffset) {
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        codeInput.setRangeText(text, start, end, 'end');
        if (cursorOffset !== undefined) {
            codeInput.selectionStart = codeInput.selectionEnd = start + cursorOffset;
        }
        codeInput.focus();
        updateMeta();
        saveDraft();
        if (liveToggle.checked) scheduleLive();
    }

    codeInput.addEventListener('keydown', (e) => {
        if (e.isComposing) return;

        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        const value = codeInput.value;
        const hasSelection = end > start;

        /* run shortcuts */
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            runCode(true);
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'Enter') {
            e.preventDefault();
            runCode(false);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            analyse();
            return;
        }

        /* undo of a programmatic replace (template / example) */
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undoBuffer && !e.shiftKey) {
            e.preventDefault();
            codeInput.value = undoBuffer.code;
            languageSelect.value = undoBuffer.language;
            undoBuffer = null;
            updateMeta();
            saveDraft();
            analyse({ silent: true });
            toast('Restored your previous code', 'ok');
            return;
        }

        /* tab / shift+tab */
        if (e.key === 'Tab') {
            e.preventDefault();
            if (hasSelection && value.substring(start, end).includes('\n')) {
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const nextBreak = value.indexOf('\n', end);
                const lineEnd = nextBreak === -1 ? value.length : nextBreak;
                const block = value.substring(lineStart, lineEnd);
                const shifted = e.shiftKey
                    ? block.split('\n').map((l) => l.replace(/^( {1,4}|\t)/, '')).join('\n')
                    : block.split('\n').map((l) => '    ' + l).join('\n');
                codeInput.setRangeText(shifted, lineStart, lineEnd, 'select');
            } else if (e.shiftKey) {
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const prefix = value.substring(lineStart, start);
                const spaces = Math.min((prefix.match(/^[ ]*/) || [''])[0].length, 4);
                if (spaces > 0) {
                    codeInput.setRangeText('', lineStart, lineStart + spaces, 'end');
                    codeInput.selectionStart = codeInput.selectionEnd = Math.max(lineStart, start - spaces);
                }
            } else {
                insertAtCursor('    ', 4);
                return;
            }
            updateMeta();
            saveDraft();
            if (liveToggle.checked) scheduleLive();
            return;
        }

        /* auto-close / wrap */
        if (PAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const open = e.key;
            const close = PAIRS[open];

            if (hasSelection) {
                e.preventDefault();
                const selected = value.substring(start, end);
                codeInput.setRangeText(open + selected + close, start, end, 'end');
                codeInput.selectionStart = start + 1;
                codeInput.selectionEnd = end + 1;
                updateMeta();
                saveDraft();
                if (liveToggle.checked) scheduleLive();
                return;
            }

            if (open === '"' || open === "'" || open === '`') {
                const nextChar = value[start] || '';
                if (nextChar === open) {
                    e.preventDefault();
                    codeInput.selectionStart = codeInput.selectionEnd = start + 1;
                    return;
                }
                if (/[\w)\]]/.test(value[start - 1] || '')) return;
                if (!nextChar || /[\s)\]};,.:]/.test(nextChar)) {
                    e.preventDefault();
                    insertAtCursor(open + close, 1);
                }
                return;
            }

            e.preventDefault();
            insertAtCursor(open + close, 1);
            return;
        }

        /* step over closing character */
        if ((')]}'.includes(e.key) || e.key === '"' || e.key === "'" || e.key === '`') && !hasSelection && value[start] === e.key) {
            e.preventDefault();
            codeInput.selectionStart = codeInput.selectionEnd = start + 1;
            return;
        }

        /* smart backspace */
        if (e.key === 'Backspace' && !hasSelection && start > 0) {
            const prev = value[start - 1];
            const next = value[start];
            if (PAIRS[prev] === next) {
                e.preventDefault();
                codeInput.setSelectionRange(start - 1, start + 1);
                codeInput.setRangeText('', start - 1, start + 1, 'end');
                codeInput.selectionStart = codeInput.selectionEnd = start - 1;
                updateMeta();
                saveDraft();
                if (liveToggle.checked) scheduleLive();
                return;
            }
        }

        /* smart enter */
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = value.substring(lineStart, start);
            const indent = (currentLine.match(/^[ \t]*/) || [''])[0];
            const prev = value[start - 1];
            const next = value[start];

            if ((prev === '{' && next === '}') || (prev === '[' && next === ']') || (prev === '(' && next === ')')) {
                e.preventDefault();
                const inner = indent + '    ';
                codeInput.setRangeText('\n' + inner + '\n' + indent, start, end, 'end');
                codeInput.selectionStart = codeInput.selectionEnd = start + 1 + inner.length;
                updateMeta();
                saveDraft();
                if (liveToggle.checked) scheduleLive();
                return;
            }

            const trimmed = currentLine.trim();
            if (trimmed.endsWith('{') || trimmed.endsWith(':') || trimmed.endsWith('(') || trimmed.endsWith('[')) {
                e.preventDefault();
                const nextIndent = indent + '    ';
                codeInput.setRangeText('\n' + nextIndent, start, end, 'end');
                codeInput.selectionStart = codeInput.selectionEnd = start + 1 + nextIndent.length;
                updateMeta();
                saveDraft();
                if (liveToggle.checked) scheduleLive();
            }
        }
    });

    /* ---------- toolbar ---------- */

    function loadCode(code, language, message) {
        if (codeInput.value.trim() && codeInput.value !== code) {
            undoBuffer = { code: codeInput.value, language: languageSelect.value };
        } else {
            undoBuffer = null;
        }
        codeInput.value = code;
        if (language) languageSelect.value = language;
        updateMeta();
        saveDraft();
        showConsoleTab('output');
        if (liveToggle.checked) analyse({ silent: true });
        if (message) toast(message);
    }

    templateBtn.addEventListener('click', () => {
        if (!runner) return;
        const lang = languageSelect.value === 'auto' ? 'python' : languageSelect.value;
        const template = runner.getTemplate(lang);
        loadCode(template, lang === 'auto' ? 'python' : lang, `${lang.toUpperCase()} template loaded — Ctrl+Z to undo`);
    });

    clearBtn.addEventListener('click', () => {
        if (!codeInput.value) return;
        undoBuffer = { code: codeInput.value, language: languageSelect.value };
        codeInput.value = '';
        updateMeta();
        saveDraft();
        resetResults();
        toast('Editor cleared — Ctrl+Z to undo');
        codeInput.focus();
    });

    copyBtn.addEventListener('click', () => copyText(codeInput.value, 'Code copied'));
    copyResultBtn.addEventListener('click', () => copyText(resultsBody.innerText, 'Results copied'));

    languageSelect.addEventListener('change', () => {
        saveDraft();
        if (codeInput.value.trim()) analyse({ silent: true });
    });

    liveToggle.addEventListener('change', () => {
        toast(liveToggle.checked ? 'Live analysis on' : 'Live analysis paused');
        if (liveToggle.checked && codeInput.value.trim()) analyse({ silent: true });
    });

    /* ================================================================
       Console helpers
       ================================================================ */

    copyTermBtn.addEventListener('click', () => copyText(terminalOutput.innerText, 'Output copied'));

    clearTermBtn.addEventListener('click', () => {
        terminalOutput.innerHTML = '<span class="t-dim">$ Cleared.</span>';
        setStatus('idle', '');
    });

    stdinInput.addEventListener('input', saveDraft);

    /* ================================================================
       Analysis
       ================================================================ */

    const scheduleLive = debounce(() => analyse({ silent: true, live: true }), 400);

    function setBusy(busy, which) {
        const pairs = [
            [runBtn, 'Running'],
            [runAnalyzeBtn, 'Running'],
            [analyzeBtn, 'Analysing'],
        ];
        pairs.forEach(([btn]) => {
            if (!btn) return;
            const content = btn.querySelector('.btn-content');
            const loading = btn.querySelector('.btn-loading');
            const active = busy && btn === which;
            btn.disabled = busy;
            if (content && loading) {
                content.style.display = active ? 'none' : '';
                loading.style.display = active ? 'inline-flex' : 'none';
            }
        });
    }

    function resetResults() {
        resultsBody.innerHTML = `
            <div class="empty">
                <div class="empty-glyph" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
                </div>
                <h2>Nothing to analyse</h2>
                <p>Write some code on the left, or load an example from the Examples tab.</p>
            </div>`;
        copyResultBtn.hidden = true;
    }

    function analyse(options = {}) {
        const { silent = false, metrics = lastMetrics } = options;
        const code = codeInput.value.trim();

        if (!code) {
            if (!silent) toast('Write some code first', 'err');
            resetResults();
            return;
        }

        const button = silent ? null : analyzeBtn;
        if (button) setBusy(true, analyzeBtn);

        const paint = () => {
            const result = analyzer.analyze(code, languageSelect.value);
            renderResults(result, code, metrics);

            if (!silent) {
                bumpCounter();
                if (!result.error) pushHistory(result, code, metrics);
            }
            if (button) setBusy(false);
        };

        if (button) requestAnimationFrame(() => requestAnimationFrame(paint));
        else paint();
    }

    function bumpCounter() {
        totalRuns += 1;
        queryCount.textContent = totalRuns;
        store.set('tc_runs', totalRuns);
    }

    /* ================================================================
       Run
       ================================================================ */

    // Esc cancels an in-flight run — remote sandboxes can queue for a minute.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isRunning && runner && typeof runner.cancel === 'function') {
            runner.cancel();
            toast('Cancelling run…');
        }
    });

    runBtn.addEventListener('click', () => runCode(false));
    runAnalyzeBtn.addEventListener('click', () => runCode(true));
    analyzeBtn.addEventListener('click', () => analyse());

    async function runCode(andAnalyse) {
        const code = codeInput.value.trim();

        if (!code) {
            toast('Write some code first', 'err');
            return;
        }
        if (!runner) {
            toast('Execution engine unavailable', 'err');
            return;
        }
        if (isRunning) return; // guard: keyboard shortcuts can't stack runs

        let lang = languageSelect.value;
        if (lang === 'auto') {
            lang = analyzer._detectLanguage(code) || 'python';
            languageSelect.value = lang;
        }

        const seq = ++runSeq;
        isRunning = true;
        const button = andAnalyse ? runAnalyzeBtn : runBtn;
        setBusy(true, button);

        showConsoleTab('output');
        setStatus('running', lang === 'pseudo' ? 'Checking…' : 'Running…');
        terminalOutput.innerHTML = `<span class="t-dim">$ Running ${esc(lang)}…</span>`;

        try {
            const result = await runner.execute(code, lang, stdinInput.value, {
                onStatus: (status) => {
                    if (seq === runSeq) terminalOutput.innerHTML = `<span class="t-dim">$ ${esc(status)}</span>`;
                },
            });

            if (seq !== runSeq) return; // a newer run owns the terminal now

            lastMetrics = result;
            renderTerminal(result);
            bumpCounter();

            // Always refresh the results panel after an explicit run — it used
            // to stay frozen whenever "Live Big O" was off.
            const analysis = analyzer.analyze(code, lang);
            renderResults(analysis, code, result);
            if (!analysis.error) pushHistory(analysis, code, result);
        } catch (err) {
            if (seq !== runSeq) return;
            setStatus('err', 'Error');
            terminalOutput.innerHTML = `<span class="t-err">Unexpected error: ${esc(err.message || err)}</span>`;
        } finally {
            if (seq === runSeq) {
                isRunning = false;
                setBusy(false);
            }
        }
    }

    function renderTerminal(result) {
        const parts = [];

        if (result.stdout) parts.push(`<span class="t-ok">${esc(result.stdout)}</span>`);
        if (result.stderr) parts.push(`<span class="t-err">${esc(result.stderr)}</span>`);
        if (!result.stdout && !result.stderr && result.compilerError) {
            parts.push(`<span class="t-err">${esc(result.compilerError)}</span>`);
        }
        if (!parts.length) parts.push('<span class="t-dim">(no output)</span>');

        parts.push('<span class="t-dim">' + esc(result.compiler || '') + ' · ' + result.durationMs + ' ms</span>');

        terminalOutput.innerHTML = parts.join('\n');
        terminalOutput.scrollTop = terminalOutput.scrollHeight;

        if (result.success) setStatus('ok', `exit 0 · ${result.durationMs} ms`);
        else setStatus('err', `exit ${result.exitCode} · ${result.durationMs} ms`);
    }

    /* ================================================================
       Results rendering
       ================================================================ */

    function ratingClass(label) {
        switch (label) {
            case 'Excellent':
            case 'Great': return 'ok';
            case 'Good': return 'ok';
            case 'Fair': return 'warn';
            case 'Poor': return 'warn';
            default: return 'err';
        }
    }

    function renderResults(result, code, metrics) {
        if (!result) return;

        if (result.error) {
            resultsBody.innerHTML = `
                <div class="result-error">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/></svg>
                    <div><strong>Can't analyse this</strong><p>${esc(result.error)}</p></div>
                </div>`;
            copyResultBtn.hidden = true;
            return;
        }

        const r = result;
        const bench = metrics ? `
            <div class="bench">
                <span class="bench-title">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 10-12h-6z"/></svg>
                    Last run
                </span>
                <span class="badge ${metrics.success ? 'ok' : 'err'}">${metrics.success ? 'succeeded' : 'failed'}</span>
                <span class="bench-sep"></span>
                <span><strong>${metrics.durationMs} ms</strong></span>
                <span class="bench-sep"></span>
                <span>exit <strong>${esc(metrics.exitCode)}</strong></span>
                <span class="bench-sep"></span>
                <span>${esc((metrics.compiler || '').replace(' · remote sandbox', ''))}</span>
            </div>` : '';

        const assumptions = (r.assumptions && r.assumptions.length) ? `
            <section class="block">
                <h3 class="block-title">Assumptions</h3>
                <ul>${r.assumptions.map((a) => `<li class="li-warn">${esc(a)}</li>`).join('')}</ul>
            </section>` : '';

        const explanation = (r.explanation || []).length ? `
            <section class="block">
                <h3 class="block-title">Why</h3>
                <ul>${r.explanation.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
            </section>` : '';

        const tips = (r.optimizations || []).length ? `
            <section class="block">
                <h3 class="block-title">Optimisation</h3>
                ${r.optimizations.map((t) => `
                    <div class="tip">
                        <svg class="tip-glyph" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/></svg>
                        <span>${esc(t)}</span>
                    </div>`).join('')}
            </section>` : '';

        resultsBody.innerHTML = `
            <div class="result-hero">
                <div class="result-hero-label">Time complexity</div>
                <div class="result-hero-value">${esc(r.timeComplexity)}</div>
                <div class="result-hero-badges">
                    <span class="badge ${ratingClass(r.rating.label)}">${esc(r.rating.label)}</span>
                    <span class="badge accent">${esc(String(r.language).toUpperCase())}</span>
                    ${r.isUncertain ? '<span class="badge warn">uncertain</span>' : ''}
                </div>
            </div>

            <div class="stat-grid">
                <div class="stat"><div class="stat-label">Best</div><div class="stat-value">${esc(r.bestCase)}</div></div>
                <div class="stat"><div class="stat-label">Average</div><div class="stat-value">${esc(r.averageCase)}</div></div>
                <div class="stat"><div class="stat-label">Worst</div><div class="stat-value">${esc(r.worstCase)}</div></div>
                <div class="stat"><div class="stat-label">Space</div><div class="stat-value">${esc(r.spaceComplexity)}</div></div>
            </div>

            ${bench}
            ${assumptions}
            ${explanation}
            ${tips}
        `;

        copyResultBtn.hidden = false;
    }

    /* ================================================================
       History
       ================================================================ */

    const MAX_HISTORY = 15;
    const MAX_HISTORY_CODE = 20000;

    function pushHistory(result, code, metrics) {
        if (!result || result.error) return; // never store broken rows

        const truncated = code.length > MAX_HISTORY_CODE;
        const entry = {
            id: Date.now() + Math.random(),
            code: truncated ? code.slice(0, MAX_HISTORY_CODE) : code,
            truncated,
            language: result.language,
            time: result.timeComplexity,
            space: result.spaceComplexity,
            runtime: metrics ? `${metrics.durationMs} ms` : null,
            at: new Date().toISOString(),
        };

        history = [entry, ...history.filter((h) => !(h.code === entry.code && h.language === entry.language))].slice(0, MAX_HISTORY);
        store.set('tc_history', history);
        renderHistory();
    }

    function renderHistory() {
        if (!history.length) {
            historySection.hidden = true;
            return;
        }

        historySection.hidden = false;
        historyGrid.innerHTML = history.map((h, i) => {
            const preview = String(h.code || '').trim().split('\n').find((l) => l.trim()) || h.code || '';
            const when = h.at ? new Date(h.at) : null;
            const time = when && !isNaN(when) ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <button class="history-row" data-index="${i}" title="Load this run">
                    <span class="h-complexity">${esc(h.time || h.timeComplexity || '—')}</span>
                    <span class="h-code">${esc(preview.slice(0, 140))}</span>
                    <span class="h-meta">
                        <span class="h-lang">${esc(h.language || '?')}</span>
                        ${h.runtime ? `<span>${esc(h.runtime)}</span>` : ''}
                        <span>${esc(time)}</span>
                    </span>
                </button>`;
        }).join('');

        historyGrid.querySelectorAll('.history-row').forEach((row) => {
            row.addEventListener('click', () => {
                const entry = history[Number(row.dataset.index)];
                if (!entry) return;
                loadCode(entry.code, entry.language, 'Loaded from history');
                if (entry.truncated) toast('Heads-up: this entry was saved truncated', 'err');
            });
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        history = [];
        store.set('tc_history', history);
        renderHistory();
        toast('History cleared');
    });

    /* ================================================================
       Examples
       ================================================================ */

    const EXAMPLES = [
        {
            name: 'Two Sum',
            complexity: 'O(n)',
            desc: 'One pass with a hash map instead of a nested loop.',
            lang: 'cpp',
            code: `// Two Sum — O(n) time, O(n) space
#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < (int)nums.size(); ++i) {
        int need = target - nums[i];
        if (seen.find(need) != seen.end()) return {seen[need], i};
        seen[nums[i]] = i;
    }
    return {};
}

int main() {
    vector<int> nums = {2, 7, 11, 15};
    vector<int> r = twoSum(nums, 9);
    cout << "indices: " << r[0] << ", " << r[1] << endl;
    return 0;
}`,
        },
        {
            name: 'Binary Search',
            complexity: 'O(log n)',
            desc: 'Halve the search space each step on a sorted array.',
            lang: 'cpp',
            code: `// Binary search — O(log n) time, O(1) space
#include <iostream>
#include <vector>
using namespace std;

int binarySearch(vector<int>& a, int target) {
    int l = 0, r = (int)a.size() - 1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        if (a[m] == target) return m;
        if (a[m] < target) l = m + 1;
        else r = m - 1;
    }
    return -1;
}

int main() {
    vector<int> a = {1, 3, 5, 7, 9, 11, 13};
    cout << "index of 9: " << binarySearch(a, 9) << endl;
    return 0;
}`,
        },
        {
            name: 'Bubble Sort',
            complexity: 'O(n²)',
            desc: 'Adjacent swaps — quadratic. Good baseline for comparison.',
            lang: 'cpp',
            code: `// Bubble sort — O(n^2) time, O(1) space
#include <iostream>
#include <vector>
using namespace std;

void bubbleSort(vector<int>& a) {
    int n = (int)a.size();
    for (int i = 0; i < n - 1; ++i)
        for (int j = 0; j < n - i - 1; ++j)
            if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);
}

int main() {
    vector<int> a = {5, 1, 4, 2, 8};
    bubbleSort(a);
    for (int x : a) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Merge Sort',
            complexity: 'O(n log n)',
            desc: 'Divide and conquer with a linear merge step.',
            lang: 'cpp',
            code: `// Merge sort — O(n log n) time, O(n) space
#include <iostream>
#include <vector>
using namespace std;

void merge(vector<int>& a, int l, int m, int r) {
    vector<int> L(a.begin() + l, a.begin() + m + 1);
    vector<int> R(a.begin() + m + 1, a.begin() + r + 1);
    int i = 0, j = 0, k = l;
    while (i < (int)L.size() && j < (int)R.size())
        a[k++] = (L[i] <= R[j]) ? L[i++] : R[j++];
    while (i < (int)L.size()) a[k++] = L[i++];
    while (j < (int)R.size()) a[k++] = R[j++];
}

void mergeSort(vector<int>& a, int l, int r) {
    if (l >= r) return;
    int m = l + (r - l) / 2;
    mergeSort(a, l, m);
    mergeSort(a, m + 1, r);
    merge(a, l, m, r);
}

int main() {
    vector<int> a = {9, 3, 7, 1, 8, 2};
    mergeSort(a, 0, (int)a.size() - 1);
    for (int x : a) cout << x << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Fibonacci (naive)',
            complexity: 'O(2^n)',
            desc: 'Exponential — the same subproblems are recomputed.',
            lang: 'cpp',
            code: `// Naive fibonacci — O(2^n) time, O(n) stack
#include <iostream>
using namespace std;

long long fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    cout << "fib(25) = " << fib(25) << endl;
    return 0;
}`,
        },
        {
            name: 'Fibonacci (memoised)',
            complexity: 'O(n)',
            desc: 'Same recursion, but each subproblem is computed once.',
            lang: 'cpp',
            code: `// Memoised fibonacci — O(n) time, O(n) space
#include <iostream>
#include <unordered_map>
using namespace std;

unordered_map<int, long long> memo;

long long fib(int n) {
    if (n <= 1) return n;
    if (memo.count(n)) return memo[n];
    memo[n] = fib(n - 1) + fib(n - 2);
    return memo[n];
}

int main() {
    cout << "fib(60) = " << fib(60) << endl;
    return 0;
}`,
        },
        {
            name: 'Matrix traversal',
            complexity: 'O(n²)',
            desc: 'Visit every cell of an n x n grid.',
            lang: 'cpp',
            code: `// Matrix traversal — O(n^2) time, O(1) space
#include <iostream>
#include <vector>
using namespace std;

int sumMatrix(vector<vector<int>>& m) {
    int n = (int)m.size(), total = 0;
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < n; ++j)
            total += m[i][j];
    return total;
}

int main() {
    vector<vector<int>> m = {{1, 2}, {3, 4}};
    cout << "sum: " << sumMatrix(m) << endl;
    return 0;
}`,
        },
        {
            name: 'BFS on a graph',
            complexity: 'O(V + E)',
            desc: 'Queue-driven traversal of every vertex and edge once.',
            lang: 'cpp',
            code: `// Breadth-first search — O(V + E) time, O(V) space
#include <iostream>
#include <vector>
#include <queue>
using namespace std;

vector<int> bfs(vector<vector<int>>& graph, int start) {
    vector<int> order, visited(graph.size(), 0);
    queue<int> q;
    q.push(start);
    visited[start] = 1;
    while (!q.empty()) {
        int node = q.front(); q.pop();
        order.push_back(node);
        for (int nb : graph[node]) {
            if (!visited[nb]) {
                visited[nb] = 1;
                q.push(nb);
            }
        }
    }
    return order;
}

int main() {
    vector<vector<int>> g = {{1, 2}, {0, 3}, {0, 3}, {1, 2}};
    for (int v : bfs(g, 0)) cout << v << " ";
    cout << endl;
    return 0;
}`,
        },
        {
            name: 'Constant-time lookup',
            complexity: 'O(1)',
            desc: 'Direct index or hash access — no iteration at all.',
            lang: 'cpp',
            code: `// Constant time — O(1) time, O(1) space
#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

int getElement(vector<int>& a, int index) {
    return a[index];
}

int getValue(unordered_map<string, int>& m, const string& key) {
    return m[key];
}

int main() {
    vector<int> a = {10, 20, 30};
    unordered_map<string, int> m = {{"x", 7}};
    cout << getElement(a, 1) << " " << getValue(m, "x") << endl;
    return 0;
}`,
        },
    ];

    function renderExamples() {
        examplesGrid.innerHTML = EXAMPLES.map((ex, i) => `
            <button class="example-card" data-index="${i}" aria-label="Load ${esc(ex.name)} example">
                <div class="example-head">
                    <span class="example-name">${esc(ex.name)}</span>
                    <span class="badge accent">${esc(ex.complexity)}</span>
                </div>
                <p class="example-desc">${esc(ex.desc)}</p>
                <pre class="example-code">${esc(ex.code.split('\n').slice(0, 9).join('\n'))}</pre>
            </button>
        `).join('');

        examplesGrid.querySelectorAll('.example-card').forEach((card) => {
            card.addEventListener('click', () => {
                const ex = EXAMPLES[Number(card.dataset.index)];
                if (!ex) return;
                $$('.tab-btn').forEach((b) => {
                    const on = b.dataset.tab === 'analyzer';
                    b.classList.toggle('is-active', on);
                    b.setAttribute('aria-selected', String(on));
                });
                $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === 'tab-analyzer'));
                loadCode(ex.code, ex.lang, `${ex.name} loaded — press Run`);
                codeInput.focus();
            });
        });
    }

    /* ================================================================
       Learn + chart
       ================================================================ */

    const COMPLEXITIES = [
        { notation: 'O(1)', name: 'Constant', color: '#0f9d8f', desc: 'Independent of input size. Array index, hash lookup.', example: 'arr[i] · dict[key] · x + y' },
        { notation: 'O(log n)', name: 'Logarithmic', color: '#3aa675', desc: 'Halves the problem each step. Binary search, balanced trees.', example: 'binary search · BST lookup' },
        { notation: 'O(n)', name: 'Linear', color: '#4f8ddb', desc: 'One pass over the input. Linear search, single loop.', example: 'for x in arr: visit(x)' },
        { notation: 'O(n log n)', name: 'Linearithmic', color: '#c08a2e', desc: 'Efficient comparison sorts and divide-and-conquer.', example: 'merge sort · heap sort · sorted()' },
        { notation: 'O(n²)', name: 'Quadratic', color: '#d2703a', desc: 'Nested loops over the same input. Bubble/insertion sort.', example: 'for i: for j: compare' },
        { notation: 'O(2^n)', name: 'Exponential', color: '#c94f45', desc: 'Doubles with each extra element. Naive recursion, subsets.', example: 'naive fibonacci · power set' },
        { notation: 'O(n!)', name: 'Factorial', color: '#a34e8f', desc: 'Every ordering. Impractical past n ≈ 12.', example: 'permutations · TSP brute force' },
    ];

    function renderLearn() {
        learnGrid.innerHTML = COMPLEXITIES.map((c) => `
            <article class="learn-card" style="--c:${c.color}">
                <div class="learn-head">
                    <span class="learn-notation">${esc(c.notation)}</span>
                    <span class="learn-name">${esc(c.name)}</span>
                </div>
                <p class="learn-desc">${esc(c.desc)}</p>
                <code class="learn-ex">${esc(c.example)}</code>
            </article>
        `).join('');

        if (chartLegend) {
            chartLegend.innerHTML = COMPLEXITIES.slice(0, 5).map((c) => `
                <span class="chart-legend-item">
                    <span class="chart-legend-swatch" style="background:${c.color}"></span>${esc(c.notation)}
                </span>`).join('');
        }
    }

    function drawChart() {
        const canvas = $('#complexityChart');
        if (!canvas || !canvas.parentElement) return;

        const box = canvas.parentElement.getBoundingClientRect();
        const W = Math.max(280, Math.floor(box.width));
        const H = 320;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = '100%';
        canvas.style.height = H + 'px';

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const css = getComputedStyle(document.documentElement);
        const gridColor = css.getPropertyValue('--border').trim() || '#e2e5ea';
        const axisColor = css.getPropertyValue('--text-3').trim() || '#6b7280';
        const textColor = css.getPropertyValue('--text-2').trim() || '#4d5562';

        const padL = 46, padR = 16, padT = 14, padB = 34;
        const plotW = Math.max(40, W - padL - padR);
        const plotH = H - padT - padB;

        const maxN = 24;
        const maxOps = 120;

        // grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = axisColor;
        ctx.textAlign = 'right';

        for (let i = 0; i <= 4; i++) {
            const y = padT + (plotH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padL, y + 0.5);
            ctx.lineTo(padL + plotW, y + 0.5);
            ctx.stroke();
            ctx.fillText(String(Math.round(maxOps - (maxOps / 4) * i)), padL - 8, y + 4);
        }

        ctx.textAlign = 'center';
        for (let n = 0; n <= maxN; n += 6) {
            const x = padL + (n / maxN) * plotW;
            ctx.fillText(String(n), x, padT + plotH + 18);
        }

        ctx.textAlign = 'center';
        ctx.fillText('input size (n)', padL + plotW / 2, H - 4);

        // curves
        const curves = [
            { label: 'O(1)', color: '#0f9d8f', fn: () => 1 },
            { label: 'O(log n)', color: '#3aa675', fn: (n) => Math.log2(Math.max(1, n)) },
            { label: 'O(n)', color: '#4f8ddb', fn: (n) => n },
            { label: 'O(n log n)', color: '#c08a2e', fn: (n) => n * Math.log2(Math.max(1, n)) },
            { label: 'O(n²)', color: '#d2703a', fn: (n) => n * n },
        ];

        curves.forEach(({ color, fn }) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            for (let n = 0; n <= maxN; n += 0.25) {
                const ops = fn(n);
                if (ops > maxOps) break;
                const x = padL + (n / maxN) * plotW;
                const y = padT + plotH - (ops / maxOps) * plotH;
                if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
        });

        // axis lines
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL + 0.5, padT);
        ctx.lineTo(padL + 0.5, padT + plotH + 0.5);
        ctx.lineTo(padL + plotW, padT + plotH + 0.5);
        ctx.stroke();

        // x-axis label colour handled above
        ctx.fillStyle = textColor;
    }

    const redrawChart = debounce(drawChart, 120);
    window.addEventListener('resize', () => {
        if ($('#tab-learn').classList.contains('is-active')) redrawChart();
    });

    /* ================================================================
       Boot
       ================================================================ */

    function boot() {
        const draft = store.get(DRAFT_KEY, null);
        if (draft && typeof draft.code === 'string' && draft.code.trim()) {
            codeInput.value = draft.code;
            if (draft.language) languageSelect.value = draft.language;
            if (typeof draft.stdin === 'string') stdinInput.value = draft.stdin;
        }

        updateMeta();
        queryCount.textContent = totalRuns;
        renderHistory();
        renderExamples();
        renderLearn();

        if (codeInput.value.trim() && liveToggle.checked) {
            analyse({ silent: true });
        }
    }

    boot();
})();
