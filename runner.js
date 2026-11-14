/**
 * TC Analyzer — Execution engine
 *
 * JS      → sandboxed Web Worker (terminatable, so `while(true){}` cannot freeze the tab)
 * Python  → Pyodide WebAssembly inside a Web Worker, fresh globals per run
 * C/C++/Java/Go/Rust → remote Wandbox compiler (with retry), or a local
 *                       `/api/run` server when you're running `node serve.js`
 */

class CodeRunner {
    constructor() {
        this.apiEndpoint = 'https://wandbox.org/api/compile.json';

        // Wall-clock limits (ms). The old build advertised 18s but the only
        // timer it had was 16s and it never applied to local JS/Python at all.
        this.LOCAL_TIMEOUT = 5000;
        // Remote sandbox timings measured 14 Nov 2026: C/C++ ≈ 3-9s, Java ≈ 6-12s,
        // Go ≈ 26-28s, Rust ≈ 20-30s. A flat 20s budget made Go/Rust fail with a
        // false "sandbox busy" message even though the compile succeeded.
        this.REMOTE_TIMEOUT = 90000;      // hard ceiling (Wandbox queues under load)
        this.REMOTE_SLOW_AFTER = 6000;    // start reporting elapsed time after this

        this.pyodideVersion = 'v0.26.4';
        this.pyodideIndex = `https://cdn.jsdelivr.net/pyodide/${this.pyodideVersion}/full/`;

        this.compilers = {
            python: 'cpython-3.12.7',
            cpp: 'gcc-13.2.0',
            c: 'gcc-13.2.0-c',
            java: 'openjdk-jdk-22+36',
            javascript: 'nodejs-20.17.0',
            go: 'go-1.23.2',
            rust: 'rust-1.82.0',
        };

        this._pyWorker = null;
        this._pyReady = false;

        this.templates = {
            python: `# Two Sum — O(n) time, O(n) space
def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        if target - num in seen:
            return [seen[target - num], i]
        seen[num] = i
    return []

nums = [2, 7, 11, 15]
target = 9
print("indices:", two_sum(nums, target))
`,

            javascript: `// Two Sum — O(n) time, O(n) space
function twoSum(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const need = target - nums[i];
        if (seen.has(need)) return [seen.get(need), i];
        seen.set(nums[i], i);
    }
    return [];
}

const nums = [2, 7, 11, 15];
console.log("indices:", twoSum(nums, 9));
`,

            cpp: `// Two Sum — O(n) time, O(n) space
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
    vector<int> res = twoSum(nums, 9);
    cout << "indices: " << res[0] << ", " << res[1] << endl;
    return 0;
}
`,

            c: `// Linear search — O(n) time, O(1) space
#include <stdio.h>

int linearSearch(int arr[], int n, int target) {
    for (int i = 0; i < n; i++)
        if (arr[i] == target) return i;
    return -1;
}

int main(void) {
    int arr[] = {10, 20, 35, 50, 75, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    printf("found 50 at index %d\\n", linearSearch(arr, n, 50));
    return 0;
}
`,

            java: `// Two Sum — O(n) time, O(n) space
import java.util.*;

class Main {
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) return new int[]{ seen.get(need), i };
            seen.put(nums[i], i);
        }
        return new int[0];
    }

    public static void main(String[] args) {
        int[] res = twoSum(new int[]{2, 7, 11, 15}, 9);
        System.out.println("indices: " + res[0] + ", " + res[1]);
    }
}
`,

            go: `// Two Sum — O(n) time, O(n) space
package main

import "fmt"

func twoSum(nums []int, target int) []int {
    seen := make(map[int]int)
    for i, num := range nums {
        if j, ok := seen[target-num]; ok {
            return []int{j, i}
        }
        seen[num] = i
    }
    return nil
}

func main() {
    res := twoSum([]int{2, 7, 11, 15}, 9)
    fmt.Println("indices:", res)
}
`,

            rust: `// Two Sum — O(n) time, O(n) space
use std::collections::HashMap;

fn two_sum(nums: &[i32], target: i32) -> Option<(usize, usize)> {
    let mut seen = HashMap::new();
    for (i, &n) in nums.iter().enumerate() {
        if let Some(&j) = seen.get(&(target - n)) {
            return Some((j, i));
        }
        seen.insert(n, i);
    }
    None
}

fn main() {
    let nums = vec![2, 7, 11, 15];
    println!("indices: {:?}", two_sum(&nums, 9));
}
`,

            pseudo: `// Pseudocode — analysed, not executed
FUNCTION twoSum(nums, target)
    CREATE empty map seen
    FOR i = 0 TO length(nums) - 1 DO
        need = target - nums[i]
        IF need EXISTS IN seen THEN
            RETURN [seen[need], i]
        END IF
        seen[nums[i]] = i
    END FOR
END FUNCTION
`,
        };
    }

    /** Abort an in-flight remote run (bound to Esc in the UI). */
    cancel() {
        this._cancelled = true;
        if (this._activeAbort) {
            try { this._activeAbort.abort(); } catch (_) {}   // no reason => AbortError
        }
    }

    /** Starter code for a language (falls back to Python). */
    getTemplate(language) {
        const lang = (language || '').toLowerCase();
        return this.templates[lang] || this.templates.python;
    }

    /**
     * Execute code.
     * @param {string} code
     * @param {string} language
     * @param {string} stdin
     * @param {{forceRemote?: boolean, onStatus?: (s: string) => void}} [opts]
     */
    async execute(code, language = 'python', stdin = '', opts = {}) {
        const startTime = performance.now();
        const normLang = (language || '').toLowerCase();
        const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : () => {};
        const forceRemote = Boolean(opts.forceRemote);

        if (normLang === 'pseudo') {
            return this._result({
                success: false,
                compiler: 'Pseudocode',
                language: 'pseudo',
                compilerError:
                    'Pseudocode can be analysed, not executed.\n' +
                    'Press "Analyse" to get the Big O, or switch the language to run real code.',
                exitCode: -1,
                startTime,
            });
        }

        // 1. JavaScript — isolated, terminatable worker
        if ((normLang === 'javascript' || normLang === 'js' || normLang === 'typescript') && !forceRemote) {
            return this._runJS(code, stdin, startTime);
        }

        // 2. Python — Pyodide in a worker, fresh namespace per run
        if ((normLang === 'python' || normLang === 'py') && !forceRemote) {
            try {
                return await this._runPython(code, stdin, startTime, onStatus);
            } catch (err) {
                console.warn('Pyodide unavailable, trying remote compiler:', err);
                onStatus('Python runtime unavailable — using remote compiler');
            }
        }

        // 3. Optional local compiler server (only when actually served locally)
        if (!forceRemote) {
            const local = await this._runLocalServer(code, normLang, stdin, startTime);
            if (local) return local;
        }

        // 4. Remote Wandbox
        return this._runWandbox(code, normLang, stdin, startTime, onStatus);
    }

    /* ==================================================================
       JavaScript — Web Worker
       ================================================================== */

    _runJS(code, stdin, startTime) {
        return new Promise((resolve) => {
            let settled = false;
            let worker;

            const finish = (res) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { worker.terminate(); } catch (_) {}
                resolve(res);
            };

            const source = `
                'use strict';
                const out = [], err = [];
                const fmt = (a) => {
                    try {
                        if (a instanceof Error) return a.stack || a.message;
                        if (typeof a === 'object' && a !== null) return JSON.stringify(a, null, 2);
                        if (typeof a === 'function') return '[Function ' + (a.name || 'anonymous') + ']';
                        return String(a);
                    } catch (_) { return String(a); }
                };
                const lines = String(${JSON.stringify(String(stdin || ''))}).split('\\n');
                let cursor = 0;

                const readNext = () => {
                    if (cursor >= lines.length) {
                        throw new Error('EOFError: program asked for more input than the Stdin tab provides.');
                    }
                    return lines[cursor++];
                };
                self.input = (...a) => { if (a.length) out.push(a.join(' ')); return readNext(); };
                self.readLine = self.input;
                self.prompt = self.input;
                self.readAll = () => lines.slice(cursor).join('\\n');
                self.print = (...a) => out.push(a.map(fmt).join(' '));
                self.require = (m) => { throw new Error("require('" + m + "') is unavailable — JavaScript runs in your browser, not Node."); };

                self.console = {
                    log: (...a) => out.push(a.map(fmt).join(' ')),
                    info: (...a) => out.push(a.map(fmt).join(' ')),
                    debug: (...a) => out.push(a.map(fmt).join(' ')),
                    warn: (...a) => out.push('[warn] ' + a.map(fmt).join(' ')),
                    error: (...a) => err.push(a.map(fmt).join(' ')),
                    table: (a) => out.push(fmt(a)),
                    trace: (...a) => out.push(a.map(fmt).join(' ')),
                };

                try {
                    const run = new Function(${JSON.stringify(code)});
                    const ret = run();
                    if (ret !== undefined) out.push('<- ' + fmt(ret));
                } catch (e) {
                    err.push(e && e.stack ? e.stack : String(e));
                }

                // flush pending microtasks / short timers before reporting
                setTimeout(() => self.postMessage({ out: out.join('\\n'), err: err.join('\\n') }), 150);
            `;

            try {
                const blob = new Blob([source], { type: 'text/javascript' });
                worker = new Worker(URL.createObjectURL(blob));
            } catch (e) {
                resolve(this._result({
                    success: false, compiler: 'V8 (Browser)', language: 'javascript',
                    compilerError: 'Could not start the JavaScript sandbox: ' + e.message,
                    exitCode: -1, startTime,
                }));
                return;
            }

            const timer = setTimeout(() => {
                finish(this._result({
                    success: false, compiler: 'V8 (Browser)', language: 'javascript',
                    compilerError:
                        `Timed out after ${this.LOCAL_TIMEOUT / 1000}s — the sandbox was stopped safely.\n` +
                        'Infinite loops, or a very large computation, end up here.',
                    stderr: 'Execution timed out',
                    exitCode: 124, startTime,
                }));
            }, this.LOCAL_TIMEOUT);

            worker.onmessage = (e) => {
                const { out = '', err = '' } = e.data || {};
                finish(this._result({
                    success: !err,
                    compiler: 'V8 (Browser Worker)',
                    language: 'javascript',
                    stdout: out ? out + '\n' : '',
                    stderr: err,
                    compilerError: err ? err : '',
                    exitCode: err ? 1 : 0,
                    startTime,
                }));
            };

            worker.onerror = (e) => {
                finish(this._result({
                    success: false, compiler: 'V8 (Browser)', language: 'javascript',
                    compilerError: e.message || 'Sandbox error',
                    exitCode: 1, startTime,
                }));
            };
        });
    }

    /* ==================================================================
       Python — Pyodide inside a Web Worker
       ================================================================== */

    _ensurePyWorker() {
        if (this._pyWorker) return this._pyWorker;

        const indexURL = this.pyodideIndex;
        const source = `
            let pyodide = null;
            let loading = null;

            async function boot() {
                if (pyodide) return pyodide;
                if (!loading) {
                    importScripts(${JSON.stringify(indexURL + 'pyodide.js')});
                    loading = loadPyodide({ indexURL: ${JSON.stringify(indexURL)} });
                }
                pyodide = await loading;
                self.postMessage({ type: 'ready' });
                return pyodide;
            }

            self.onmessage = async (e) => {
                const msg = e.data || {};
                if (msg.type !== 'run') return;
                const out = [], err = [];

                try {
                    const py = await boot();
                    py.setStdout({ batched: (s) => out.push(s) });
                    py.setStderr({ batched: (s) => err.push(s) });

                    // Fresh stdin queue + fresh globals for every single run.
                    const lines = String(msg.stdin || '').split('\\n');
                    let cursor = 0;
                    py.setStdin({ stdin: () => (cursor < lines.length ? lines[cursor++] : null) });

                    const ns = py.globals.get('dict')();
                    try {
                        await py.runPythonAsync(msg.code, { globals: ns });
                    } finally {
                        ns.destroy();
                    }

                    self.postMessage({
                        type: 'done', id: msg.id, ok: true,
                        out: out.join('\\n'), err: err.join('\\n'),
                    });
                } catch (e2) {
                    self.postMessage({
                        type: 'done', id: msg.id, ok: false,
                        out: out.join('\\n'),
                        err: String((e2 && e2.message) || e2) + (err.length ? '\\n' + err.join('\\n') : ''),
                    });
                }
            };
        `;

        const blob = new Blob([source], { type: 'text/javascript' });
        this._pyWorker = new Worker(URL.createObjectURL(blob));
        this._pyReady = false;
        this._pySeq = 0;
        this._pyPending = new Map();

        this._pyWorker.onmessage = (e) => {
            const msg = e.data || {};
            if (msg.type === 'ready') {
                this._pyReady = true;
                if (this._onPyReady) this._onPyReady();
                return;
            }
            if (msg.type === 'done') {
                const pending = this._pyPending.get(msg.id);
                if (pending) {
                    this._pyPending.delete(msg.id);
                    pending(msg);
                }
            }
        };

        this._pyWorker.onerror = (e) => {
            const err = e.message || 'Python worker crashed';
            this._pyPending.forEach((pending) => pending({ ok: false, out: '', err }));
            this._pyPending.clear();
            this._killPyWorker();
        };

        return this._pyWorker;
    }

    _killPyWorker() {
        if (this._pyWorker) {
            try { this._pyWorker.terminate(); } catch (_) {}
        }
        this._pyWorker = null;
        this._pyReady = false;
        this._pyPending = new Map();
    }

    _runPython(code, stdin, startTime, onStatus) {
        return new Promise((resolve) => {
            let worker;
            try {
                worker = this._ensurePyWorker();
            } catch (e) {
                resolve(null);
                return;
            }

            const id = ++this._pySeq;
            let settled = false;

            const done = (res) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this._pyPending.delete(id);
                resolve(this._result({ language: 'python', startTime, ...res }));
            };

            const timer = setTimeout(() => {
                // Terminate: this is the only way to stop synchronous Python/WASM.
                this._killPyWorker();
                done({
                    success: false,
                    compiler: 'Pyodide (WebAssembly)',
                    compilerError:
                        `Timed out after ${this.LOCAL_TIMEOUT / 1000}s — the Python runtime was restarted.\n` +
                        'The next run will reload it (a few seconds).',
                    stderr: 'Execution timed out',
                    exitCode: 124,
                });
            }, this.LOCAL_TIMEOUT);

            this._pyPending.set(id, (msg) => {
                done({
                    success: Boolean(msg.ok),
                    compiler: 'Pyodide (WebAssembly Python 3.12)',
                    stdout: msg.out ? msg.out + '\n' : '',
                    stderr: msg.err,
                    compilerError: msg.ok ? '' : msg.err,
                    exitCode: msg.ok ? 0 : 1,
                });
            });

            if (!this._pyReady) {
                onStatus('Loading Python runtime (one-time, ~5 MB)…');
                this._onPyReady = () => onStatus('Python runtime ready');
            } else {
                onStatus('Running…');
            }

            worker.postMessage({ type: 'run', id, code, stdin: stdin || '' });
        });
    }

    /* ==================================================================
       Optional local compiler server (serve.js)
       ================================================================== */

    async _runLocalServer(code, language, stdin, startTime) {
        // Only bother when we are genuinely served from localhost — in
        // production this endpoint 404s and every run wasted a round-trip.
        if (typeof window === 'undefined') return null;
        const host = window.location.hostname;
        if (!(host === 'localhost' || host === '127.0.0.1' || host === '[::1]')) return null;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
            const res = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, stdin }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) return null;
            const data = await res.json();
            if (!data || data.supportedLocally === false) return null;
            return { ...data, durationMs: data.durationMs || Math.round(performance.now() - startTime) };
        } catch (_) {
            clearTimeout(timeoutId);
            return null;
        }
    }

    /* ==================================================================
       Remote Wandbox
       ================================================================== */

    /** Wandbox writes the file as prog.java / prog.cc, so a `public class X`
     *  cannot compile unless X is the file name. Drop the modifier — the class
     *  still compiles fine as package-private. */
    _normalizeJava(code) {
        return code
            .split('\n')
            .map((line) => (/^public\s+(?:(?:final|abstract)\s+)?(?:class|interface|enum)\s+\w+/.test(line)
                ? line.replace(/^public\s+/, '')
                : line))
            .join('\n');
    }

    async _runWandbox(code, language, stdin, startTime, onStatus = () => {}, retries = 2) {
        let compiler = this.compilers[language] || this.compilers.python;
        let lastError = null;
        let timedOut = false;
        let cancelled = false;
        const payloadCode = language === 'java' ? this._normalizeJava(code) : code;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1 && language === 'cpp' && compiler === 'gcc-13.2.0') {
                    compiler = 'gcc-head';
                }

                const controller = new AbortController();
                this._activeAbort = controller;
                const timeoutId = setTimeout(() => controller.abort(), this.REMOTE_TIMEOUT);
                let slowNote = null;
                if (attempt === 1) {
                    slowNote = setTimeout(() => {
                        const started = performance.now();
                        this._progressTimer = setInterval(() => {
                            const secs = Math.round((performance.now() - started) / 1000) + this.REMOTE_SLOW_AFTER / 1000;
                            onStatus(`${compiler}: still compiling in the remote sandbox… ${secs}s (Esc to cancel)`);
                        }, 3000);
                    }, this.REMOTE_SLOW_AFTER);
                }

                const payload = {
                    code: payloadCode,
                    compiler,
                    stdin: stdin || '',
                    'compiler-option-raw': (language === 'cpp' || language === 'c') ? '-O0' : '',
                };

                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (slowNote) clearTimeout(slowNote);
                clearInterval(this._progressTimer);
                this._progressTimer = null;
                this._activeAbort = null;

                if (!response.ok) {
                    throw new Error(`Compiler service returned HTTP ${response.status}`);
                }

                const data = await response.json();
                const stdout = data.program_output || '';
                const stderr = data.program_error || '';
                const compilerErr = data.compiler_error || data.compiler_message || '';
                const exitStatus = data.status;

                const fullErr = compilerErr + '\n' + stderr;
                const isOverload =
                    fullErr.includes('OCI runtime error') ||
                    fullErr.includes('Resource temporarily unavailable') ||
                    fullErr.includes('crun: clone') ||
                    exitStatus === '126' || exitStatus === 126;

                if (isOverload && attempt < retries) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }

                const finalCompilerErr = isOverload
                    ? 'The remote compiler sandbox is busy right now.\nTry again in a few seconds.'
                    : compilerErr;

                const isSuccess = (exitStatus === '0' || exitStatus === 0) && !compilerErr && !isOverload;

                return this._result({
                    success: isSuccess,
                    compiler: `${compiler} · remote sandbox`,
                    language,
                    stdout,
                    stderr,
                    compilerError: finalCompilerErr,
                    exitCode: exitStatus !== undefined ? exitStatus : (isSuccess ? 0 : 1),
                    startTime,
                });
            } catch (err) {
                lastError = err;
                if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
                this._activeAbort = null;
                // Never retry after an abort — either the user cancelled or the
                // full budget was spent; retrying would just double the wait.
                const wasAbort = err && (err.name === 'AbortError' || err === 'timeout' || err === 'user');
                if (wasAbort) {
                    cancelled = this._cancelled === true;
                    timedOut = !cancelled;
                    this._cancelled = false;
                    break;
                }
                if (attempt < retries) await new Promise((r) => setTimeout(r, 800));
            }
        }

        if (cancelled) {
            return this._result({
                success: false,
                compiler,
                language,
                stderr: 'Cancelled',
                compilerError: 'Run cancelled by you.',
                exitCode: 130,
                startTime,
            });
        }

        const message = timedOut
            ? `No response after ${this.REMOTE_TIMEOUT / 1000}s. The compiler sandbox may be busy — try again.`
            : (lastError ? lastError.message : 'Unknown execution failure');

        return this._result({
            success: false,
            compiler,
            language,
            stderr: message,
            compilerError: `Compiler connection error\n${message}`,
            exitCode: -1,
            startTime,
        });
    }

    /* ==================================================================
       Helpers
       ================================================================== */

    _result({ success, compiler, language, stdout = '', stderr = '', compilerError = '', exitCode = 0, startTime }) {
        return {
            success: Boolean(success),
            compiler,
            language,
            stdout,
            stderr,
            compilerError,
            exitCode,
            durationMs: Math.max(1, Math.round(performance.now() - startTime)),
            isLocal: !/remote sandbox/.test(compiler || ''),
        };
    }
}

if (typeof window !== 'undefined') window.CodeRunner = CodeRunner;
if (typeof module !== 'undefined' && module.exports) module.exports = CodeRunner;
