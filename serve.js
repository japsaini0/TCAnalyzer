const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

const PORT = 3000;
const DIR = __dirname;

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

// Check for local compilers
const GPP_PATH = fs.existsSync('C:\\MinGW\\bin\\g++.exe') ? 'C:\\MinGW\\bin\\g++.exe' : 'g++';
const GCC_PATH = fs.existsSync('C:\\MinGW\\bin\\gcc.exe') ? 'C:\\MinGW\\bin\\gcc.exe' : 'gcc';
const PYTHON_PATH = 'python';
const NODE_PATH = 'node';

const server = http.createServer((req, res) => {
    // CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let reqPath = req.url.split('?')[0];

    // Status endpoint
    if (reqPath === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            localExecution: true,
            compilers: {
                cpp: GPP_PATH,
                c: GCC_PATH,
                python: PYTHON_PATH,
                javascript: NODE_PATH
            }
        }));
        return;
    }

    // Local code execution endpoint
    if (reqPath === '/api/run' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                handleLocalExecution(payload, res);
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, compilerError: 'Invalid JSON body: ' + err.message }));
            }
        });
        return;
    }

    // Static file serving
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(DIR, reqPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

/**
 * Executes code locally on the user's host machine with strict timeouts
 */
function handleLocalExecution(payload, res) {
    const { code, language, stdin = '' } = payload;
    const normLang = (language || '').toLowerCase();
    const startTime = Date.now();

    if (!code || !code.trim()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            compilerError: 'No code provided',
            exitCode: 1,
            durationMs: 0
        }));
        return;
    }

    // C++ Execution
    if (normLang === 'cpp' || normLang === 'c++') {
        return executeCompiledCPlusPlus(code, stdin, startTime, res);
    }

    // C Execution
    if (normLang === 'c') {
        return executeCompiledC(code, stdin, startTime, res);
    }

    // Python Execution
    if (normLang === 'python' || normLang === 'py') {
        return executePython(code, stdin, startTime, res);
    }

    // JavaScript Execution
    if (normLang === 'javascript' || normLang === 'js') {
        return executeNodeJS(code, stdin, startTime, res);
    }

    // Fallback for languages without local compiler installed (Java, Go, Rust)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        supportedLocally: false,
        message: `Local compiler not configured for ${language}, use remote compilation.`
    }));
}

/**
 * Compiles and runs C++ code with MinGW GCC
 */
function executeCompiledCPlusPlus(code, stdin, startTime, res) {
    const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tmpCpp = path.join(os.tmpdir(), `${id}.cpp`);
    const tmpExe = path.join(os.tmpdir(), `${id}.exe`);

    function cleanup() {
        try { fs.unlinkSync(tmpCpp); } catch (e) {}
        try { fs.unlinkSync(tmpExe); } catch (e) {}
    }

    fs.writeFile(tmpCpp, code, 'utf8', (writeErr) => {
        if (writeErr) {
            cleanup();
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, compilerError: 'Could not write temp file' }));
        }

        // Fast compile command without -O2 to keep compilation sub-second
        const compileCmd = `"${GPP_PATH}" "${tmpCpp}" -o "${tmpExe}"`;
        exec(compileCmd, { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
            if (compileErr) {
                cleanup();
                const duration = Date.now() - startTime;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: false,
                    compiler: 'Local GCC (MinGW)',
                    language: 'cpp',
                    stdout: compileStdout || '',
                    stderr: compileStderr || '',
                    compilerError: compileStderr || 'Compilation failed',
                    exitCode: 1,
                    durationMs: duration,
                    isLocal: true
                }));
            }

            runBinary(tmpExe, stdin, startTime, 'Local GCC (MinGW)', 'cpp', cleanup, res);
        });
    });
}

/**
 * Compiles and runs C code with MinGW GCC
 */
function executeCompiledC(code, stdin, startTime, res) {
    const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tmpC = path.join(os.tmpdir(), `${id}.c`);
    const tmpExe = path.join(os.tmpdir(), `${id}.exe`);

    function cleanup() {
        try { fs.unlinkSync(tmpC); } catch (e) {}
        try { fs.unlinkSync(tmpExe); } catch (e) {}
    }

    fs.writeFile(tmpC, code, 'utf8', (writeErr) => {
        if (writeErr) {
            cleanup();
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, compilerError: 'Could not write temp file' }));
        }

        const compileCmd = `"${GCC_PATH}" "${tmpC}" -o "${tmpExe}"`;
        exec(compileCmd, { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
            if (compileErr) {
                cleanup();
                const duration = Date.now() - startTime;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: false,
                    compiler: 'Local GCC (MinGW)',
                    language: 'c',
                    stdout: compileStdout || '',
                    stderr: compileStderr || '',
                    compilerError: compileStderr || 'Compilation failed',
                    exitCode: 1,
                    durationMs: duration,
                    isLocal: true
                }));
            }

            runBinary(tmpExe, stdin, startTime, 'Local GCC (MinGW)', 'c', cleanup, res);
        });
    });
}

/**
 * Executes a compiled binary with timeout and stdin piping
 */
function runBinary(exePath, stdin, startTime, compilerName, language, cleanup, res) {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(exePath, [], { timeout: 5000 });

    const timeoutTimer = setTimeout(() => {
        killed = true;
        try { proc.kill(); } catch (e) {}
    }, 5000);

    if (stdin) {
        proc.stdin.write(stdin);
    }
    proc.stdin.end();

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code) => {
        clearTimeout(timeoutTimer);
        cleanup();
        const duration = Date.now() - startTime;
        if (killed) {
            stderr += '\nExecution timed out (5s limit reached). Check for infinite loops.';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: (code === 0) && !killed,
            compiler: compilerName,
            language: language,
            stdout: stdout,
            stderr: stderr,
            compilerError: killed ? 'Execution timed out' : '',
            exitCode: killed ? -1 : (code !== null ? code : 0),
            durationMs: duration,
            isLocal: true
        }));
    });

    proc.on('error', (err) => {
        clearTimeout(timeoutTimer);
        cleanup();
        const duration = Date.now() - startTime;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            compiler: compilerName,
            language: language,
            stdout: stdout,
            stderr: err.message,
            compilerError: err.message,
            exitCode: 1,
            durationMs: duration,
            isLocal: true
        }));
    });
}

/**
 * Runs Python code locally
 */
function executePython(code, stdin, startTime, res) {
    const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tmpPy = path.join(os.tmpdir(), `${id}.py`);

    function cleanup() {
        try { fs.unlinkSync(tmpPy); } catch (e) {}
    }

    fs.writeFile(tmpPy, code, 'utf8', (err) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, compilerError: 'Could not write temp file' }));
        }

        let stdout = '';
        let stderr = '';
        let killed = false;

        const proc = spawn(PYTHON_PATH, ['-u', tmpPy], { timeout: 5000 });

        const timer = setTimeout(() => {
            killed = true;
            try { proc.kill(); } catch (e) {}
        }, 5000);

        if (stdin) {
            proc.stdin.write(stdin);
        }
        proc.stdin.end();

        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());

        proc.on('close', (code) => {
            clearTimeout(timer);
            cleanup();
            const duration = Date.now() - startTime;
            if (killed) stderr += '\nExecution timed out (5s limit).';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: code === 0 && !killed,
                compiler: 'Local Python 3.12',
                language: 'python',
                stdout,
                stderr,
                compilerError: killed ? 'Execution timed out' : '',
                exitCode: killed ? -1 : (code !== null ? code : 0),
                durationMs: duration,
                isLocal: true
            }));
        });

        proc.on('error', (e) => {
            clearTimeout(timer);
            cleanup();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                compiler: 'Local Python',
                language: 'python',
                stdout: '',
                stderr: e.message,
                compilerError: e.message,
                exitCode: 1,
                durationMs: Date.now() - startTime,
                isLocal: true
            }));
        });
    });
}

/**
 * Runs JavaScript code locally with Node
 */
function executeNodeJS(code, stdin, startTime, res) {
    const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tmpJs = path.join(os.tmpdir(), `${id}.js`);

    function cleanup() {
        try { fs.unlinkSync(tmpJs); } catch (e) {}
    }

    fs.writeFile(tmpJs, code, 'utf8', (err) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, compilerError: 'Could not write temp file' }));
        }

        let stdout = '';
        let stderr = '';
        let killed = false;

        const proc = spawn(NODE_PATH, [tmpJs], { timeout: 5000 });

        const timer = setTimeout(() => {
            killed = true;
            try { proc.kill(); } catch (e) {}
        }, 5000);

        if (stdin) {
            proc.stdin.write(stdin);
        }
        proc.stdin.end();

        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());

        proc.on('close', (code) => {
            clearTimeout(timer);
            cleanup();
            const duration = Date.now() - startTime;
            if (killed) stderr += '\nExecution timed out (5s limit).';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: code === 0 && !killed,
                compiler: 'Local Node.js',
                language: 'javascript',
                stdout,
                stderr,
                compilerError: killed ? 'Execution timed out' : '',
                exitCode: killed ? -1 : (code !== null ? code : 0),
                durationMs: duration,
                isLocal: true
            }));
        });

        proc.on('error', (e) => {
            clearTimeout(timer);
            cleanup();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                compiler: 'Local Node.js',
                language: 'javascript',
                stdout: '',
                stderr: e.message,
                compilerError: e.message,
                exitCode: 1,
                durationMs: Date.now() - startTime,
                isLocal: true
            }));
        });
    });
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`⚡ TC Analyzer Server running at http://localhost:${PORT}/`);
    console.log(`Local compilers detected: C++ (${GPP_PATH}), C (${GCC_PATH}), Python (${PYTHON_PATH})`);
});
