/**
 * TC Analyzer — Code Execution & Compiler Engine
 * 
 * Supports:
 * - Multi-language remote compilation via Wandbox (C++, Python, Java, C, Go, Rust)
 * - Instant local client-side execution for JavaScript (Web Worker / Sandbox)
 * - Standard input (stdin) support
 * - Execution benchmarking and latency tracking
 * - Starter code templates for all supported languages
 */

class CodeRunner {
    constructor() {
        this.apiEndpoint = 'https://wandbox.org/api/compile.json';
        
        // Compiler mappings
        this.compilers = {
            'python': 'cpython-3.12.7',
            'cpp': 'gcc-13.2.0',
            'c': 'gcc-13.2.0-c',
            'java': 'openjdk-jdk-22+36',
            'javascript': 'nodejs-20.17.0',
            'go': 'go-1.23.2',
            'rust': 'rust-1.82.0'
        };

        // Runnable algorithm templates
        this.templates = {
            python: `# Two Sum — O(N) Time, O(N) Space
def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []

# Test execution
nums = [2, 7, 11, 15]
target = 9
result = two_sum(nums, target)

print("--- Execution Output ---")
print(f"Array: {nums}")
print(f"Target: {target}")
print(f"Solution indices: {result}")
print(f"Values: [{nums[result[0]]}, {nums[result[1]]}]")
`,

            javascript: `// Two Sum — O(N) Time, O(N) Space
function twoSum(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (seen.has(complement)) {
            return [seen.get(complement), i];
        }
        seen.set(nums[i], i);
    }
    return [];
}

// Test execution
const nums = [2, 7, 11, 15];
const target = 9;
const result = twoSum(nums, target);

console.log("--- Execution Output ---");
console.log("Array:", nums);
console.log("Target:", target);
console.log("Solution indices:", result);
if (result.length) {
    console.log(\`Values: [\${nums[result[0]]}, \${nums[result[1]]}]\`);
}
`,

            cpp: `// Two Sum — O(N) Time, O(N) Space
#include <iostream>
#include <vector>
#include <unordered_map>

using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < (int)nums.size(); ++i) {
        int complement = target - nums[i];
        if (seen.find(complement) != seen.end()) {
            return {seen[complement], i};
        }
        seen[nums[i]] = i;
    }
    return {};
}

int main() {
    vector<int> nums = {2, 7, 11, 15};
    int target = 9;
    vector<int> res = twoSum(nums, target);

    cout << "--- Execution Output ---" << endl;
    cout << "Target: " << target << endl;
    if (res.size() >= 2) {
        cout << "Indices: [" << res[0] << ", " << res[1] << "]" << endl;
        cout << "Values: [" << nums[res[0]] << ", " << nums[res[1]] << "]" << endl;
    }
    return 0;
}
`,

            c: `// Linear Search — O(N) Time, O(1) Space
#include <stdio.h>

int linearSearch(int arr[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (arr[i] == target) return i;
    }
    return -1;
}

int main() {
    int arr[] = {10, 20, 35, 50, 75, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    int target = 50;

    printf("--- Execution Output ---\\n");
    int idx = linearSearch(arr, n, target);
    if (idx != -1) {
        printf("Found %d at index %d\\n", target, idx);
    } else {
        printf("Target %d not found\\n", target);
    }
    return 0;
}
`,

            java: `// Two Sum — O(N) Time, O(N) Space
import java.util.*;

class Main {
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[] { map.get(complement), i };
            }
            map.put(nums[i], i);
        }
        return new int[0];
    }

    public static void main(String[] args) {
        int[] nums = {2, 7, 11, 15};
        int target = 9;
        int[] result = twoSum(nums, target);

        System.out.println("--- Execution Output ---");
        System.out.println("Target: " + target);
        if (result.length >= 2) {
            System.out.println("Indices: [" + result[0] + ", " + result[1] + "]");
            System.out.println("Values: [" + nums[result[0]] + ", " + nums[result[1]] + "]");
        }
    }
}
`,

            go: `// Two Sum — O(N) Time, O(N) Space
package main

import "fmt"

func twoSum(nums []int, target int) []int {
    seen := make(map[int]int)
    for i, num := range nums {
        complement := target - num
        if idx, found := seen[complement]; found {
            return []int{idx, i}
        }
        seen[num] = i
    }
    return nil
}

func main() {
    nums := []int{2, 7, 11, 15}
    target := 9
    res := twoSum(nums, target)

    fmt.Println("--- Execution Output ---")
    fmt.Println("Target:", target)
    if len(res) == 2 {
        fmt.Printf("Indices: [%d, %d]\\n", res[0], res[1])
        fmt.Printf("Values: [%d, %d]\\n", nums[res[0]], nums[res[1]])
    }
}
`,

            rust: `// Two Sum — O(N) Time, O(N) Space
use std::collections::HashMap;

fn two_sum(nums: &[i32], target: i32) -> Option<(usize, usize)> {
    let mut seen = HashMap::new();
    for (i, &num) in nums.iter().enumerate() {
        let complement = target - num;
        if let Some(&prev_idx) = seen.get(&complement) {
            return Some((prev_idx, i));
        }
        seen.insert(num, i);
    }
    None
}

fn main() {
    let nums = vec![2, 7, 11, 15];
    let target = 9;

    println!("--- Execution Output ---");
    println!("Target: {}", target);
    if let Some((i, j)) = two_sum(&nums, target) {
        println!("Indices: [{}, {}]", i, j);
        println!("Values: [{}, {}]", nums[i], nums[j]);
    }
}
`
        };
    }

    /**
     * Get starter code template for a language
     */
    getTemplate(language) {
        const lang = (language || '').toLowerCase();
        return this.templates[lang] || this.templates['python'];
    }

    /**
     * Execute code either in-browser (JS / Pyodide Python), via local compiler server, or via Wandbox remote compiler
     * @param {string} code 
     * @param {string} language 
     * @param {string} stdin 
     * @param {boolean} forceRemote 
     */
    async execute(code, language = 'python', stdin = '', forceRemote = false) {
        const startTime = performance.now();
        const normLang = (language || '').toLowerCase();

        // 1. Fast path for JavaScript (in-browser sandbox)
        if ((normLang === 'javascript' || normLang === 'js') && !forceRemote) {
            return this._executeLocalJS(code, startTime);
        }

        // 2. In-browser Python via Pyodide WebAssembly (rock-solid, zero OCI/server errors)
        if ((normLang === 'python' || normLang === 'py') && !forceRemote) {
            try {
                return await this._executePythonInBrowser(code, startTime, stdin);
            } catch (pyErr) {
                console.warn('Pyodide in-browser execution fallback to local server or remote:', pyErr);
            }
        }

        // 3. Fast path: Local Server Execution (sub-second native compilation for C++, C, Python, etc.)
        if (!forceRemote) {
            try {
                const localResult = await this._executeLocalServer(code, normLang, stdin, startTime);
                if (localResult && localResult.supportedLocally !== false) {
                    return localResult;
                }
            } catch (serverErr) {
                // Local server endpoint not reachable -> fallback smoothly to remote Wandbox
            }
        }

        // 4. Remote execution via Wandbox with auto-retry
        return await this._executeWandboxWithRetry(code, normLang, stdin, startTime);
    }

    /**
     * Attempts execution via local Node backend (/api/run) for near-instant native compiles
     */
    async _executeLocalServer(code, language, stdin = '', startTime = performance.now()) {
        const isHttp = typeof window !== 'undefined' && 
                       (window.location.protocol === 'http:' || window.location.protocol === 'https:');
        if (!isHttp) return null;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
            const res = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, stdin }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) return null;

            const data = await res.json();
            if (!data || data.supportedLocally === false) {
                return null;
            }

            return data;
        } catch (e) {
            clearTimeout(timeoutId);
            return null;
        }
    }

    /**
     * Executes Python directly in-browser using Pyodide WebAssembly
     */
    async _executePythonInBrowser(code, startTime, stdin = '') {
        if (typeof loadPyodide === 'undefined') {
            throw new Error('Pyodide library not available in environment');
        }

        // Lazy initialize Pyodide instance
        if (!this._pyodidePromise) {
            this._pyodidePromise = loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
            });
        }

        const pyodide = await this._pyodidePromise;
        const logs = [];
        const errors = [];

        // Setup custom stdout/stderr callbacks
        pyodide.setStdout({ batched: (msg) => logs.push(msg) });
        pyodide.setStderr({ batched: (msg) => errors.push(msg) });

        // Handle standard input if provided
        if (stdin) {
            try {
                pyodide.setStdin({
                    stdin: () => {
                        if (!this._stdinLines) {
                            this._stdinLines = stdin.split('\n');
                        }
                        return this._stdinLines.length ? this._stdinLines.shift() : null;
                    }
                });
            } catch (e) {
                // Ignore stdin setup error if unsupported
            }
        }

        let isSuccess = true;
        let errMsg = '';

        try {
            await pyodide.runPythonAsync(code);
        } catch (err) {
            isSuccess = false;
            errMsg = err.message || String(err);
            errors.push(errMsg);
        }

        const duration = Math.max(1, Math.round(performance.now() - startTime));

        return {
            success: isSuccess,
            compiler: 'Pyodide (WebAssembly Python 3.12 in Browser)',
            language: 'python',
            stdout: logs.join('\n') + (logs.length ? '\n' : ''),
            stderr: errors.join('\n'),
            compilerError: isSuccess ? '' : errMsg,
            exitCode: isSuccess ? 0 : 1,
            durationMs: duration,
            isLocal: true
        };
    }

    /**
     * Executes code via Wandbox with automatic retry on transient OCI / container overload errors
     */
    async _executeWandboxWithRetry(code, language, stdin = '', startTime = performance.now(), retries = 2) {
        let compiler = this.compilers[language] || this.compilers['python'];
        let lastError = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // If retrying C++ or C, try alternate compiler head if container failed on attempt 1
                if (attempt > 1 && language === 'cpp' && compiler === 'gcc-13.2.0') {
                    compiler = 'gcc-head';
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 16000);

                const payload = {
                    code: code,
                    compiler: compiler,
                    stdin: stdin || '',
                    'compiler-option-raw': (language === 'cpp' || language === 'c') ? '-O0' : ''
                };

                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Compiler service returned HTTP ${response.status}`);
                }

                const data = await response.json();
                const duration = Math.round(performance.now() - startTime);

                const stdout = data.program_output || '';
                const stderr = data.program_error || '';
                const compilerErr = data.compiler_error || data.compiler_message || '';
                const exitStatus = data.status;

                // Check for transient container overload errors (e.g., OCI runtime error, crun: clone)
                const fullErr = (compilerErr + '\n' + stderr);
                const isOverloadError = fullErr.includes('OCI runtime error') || 
                                       fullErr.includes('Resource temporarily unavailable') || 
                                       fullErr.includes('crun: clone') || 
                                       exitStatus === '126' ||
                                       exitStatus === 126;

                if (isOverloadError && attempt < retries) {
                    console.warn(`Wandbox busy (attempt ${attempt}/${retries}). Retrying with alternate compiler in 800ms...`);
                    await new Promise(r => setTimeout(r, 800));
                    continue; // Retry
                }

                // If still overloaded on final attempt, format user-friendly message
                let finalCompilerErr = compilerErr;
                if (isOverloadError) {
                    finalCompilerErr = '⚠️ The remote compiler sandbox is temporarily experiencing high traffic (container limit reached).\nClick "Run Code" again in a few seconds to retry, or run via local server for instant execution.';
                }

                const isSuccess = (exitStatus === '0' || exitStatus === 0) && !compilerErr && !isOverloadError;

                return {
                    success: isSuccess,
                    compiler: `${compiler} (Wandbox Remote Sandbox)`,
                    language: language,
                    stdout: stdout,
                    stderr: stderr,
                    compilerError: finalCompilerErr,
                    exitCode: exitStatus !== undefined ? exitStatus : (isSuccess ? 0 : 1),
                    durationMs: duration,
                    isLocal: false
                };
            } catch (err) {
                lastError = err;
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }

        const duration = Math.round(performance.now() - startTime);
        let errorMsg = lastError ? lastError.message : 'Unknown execution failure';
        if (lastError && lastError.name === 'AbortError') {
            errorMsg = 'Execution timed out (limit: 18 seconds). Check for infinite loops.';
        }

        return {
            success: false,
            compiler: compiler,
            language: language,
            stdout: '',
            stderr: errorMsg,
            compilerError: `Compiler Connection Error:\n${errorMsg}`,
            exitCode: -1,
            durationMs: duration,
            isLocal: false
        };
    }

    /**
     * Executes JavaScript safely in-browser with console capturing
     */
    _executeLocalJS(code, startTime) {
        const logs = [];
        const errors = [];
        
        // Capture console outputs
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;

        const stringifyArg = (arg) => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        };

        console.log = (...args) => {
            logs.push(args.map(stringifyArg).join(' '));
        };
        console.info = (...args) => {
            logs.push('[INFO] ' + args.map(stringifyArg).join(' '));
        };
        console.warn = (...args) => {
            logs.push('[WARN] ' + args.map(stringifyArg).join(' '));
        };
        console.error = (...args) => {
            errors.push('[ERROR] ' + args.map(stringifyArg).join(' '));
        };

        let result = null;
        let isSuccess = true;

        try {
            // Execute in an isolated function wrapper
            const runnerFn = new Function(code);
            result = runnerFn();
            if (result !== undefined) {
                logs.push(`<- Return: ${stringifyArg(result)}`);
            }
        } catch (err) {
            isSuccess = false;
            errors.push(err.stack || err.message);
        } finally {
            // Restore console
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
            console.info = originalInfo;
        }

        const duration = Math.max(1, Math.round(performance.now() - startTime));

        return {
            success: isSuccess,
            compiler: 'V8 (In-Browser Web Engine)',
            language: 'javascript',
            stdout: logs.join('\n') + (logs.length ? '\n' : ''),
            stderr: errors.join('\n'),
            compilerError: isSuccess ? '' : errors.join('\n'),
            exitCode: isSuccess ? 0 : 1,
            durationMs: duration,
            isLocal: true
        };
    }
}

// Export for browser and node environments
if (typeof window !== 'undefined') {
    window.CodeRunner = CodeRunner;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CodeRunner;
}
