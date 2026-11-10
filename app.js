/**
 * TC Analyzer — Application Logic
 * Handles UI interactions, tabs, examples, history, particles, and charts.
 */

(function () {
    'use strict';

    const analyzer = new ComplexityAnalyzer();

    // ==================== DOM References ====================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const codeInput = $('#codeInput');
    const lineNumbers = $('#lineNumbers');
    const analyzeBtn = $('#analyzeBtn');
    const clearBtn = $('#clearBtn');
    const copyBtn = $('#copyBtn');
    const copyResultBtn = $('#copyResultBtn');
    const resultsBody = $('#resultsBody');
    const charCount = $('#charCount');
    const lineCount = $('#lineCount');
    const queryCount = $('#queryCount');
    const themeToggle = $('#themeToggle');
    const historySection = $('#historySection');
    const historyGrid = $('#historyGrid');
    const clearHistoryBtn = $('#clearHistoryBtn');
    const examplesGrid = $('#examplesGrid');
    const learnGrid = $('#learnGrid');
    const toast = $('#toast');

    let totalQueries = parseInt(localStorage.getItem('tc_queries') || '0');
    let history = JSON.parse(localStorage.getItem('tc_history') || '[]');

    // ==================== Theme ====================
    const savedTheme = localStorage.getItem('tc_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('tc_theme', next);
        updateThemeIcon();
    });

    function updateThemeIcon() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        $('.theme-icon').textContent = isDark ? '🌙' : '☀️';
    }

    // ==================== Tabs ====================
    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.tab-content').forEach(t => t.classList.remove('active'));
            $(`#tab-${btn.dataset.tab}`).classList.add('active');

            if (btn.dataset.tab === 'learn') {
                setTimeout(drawComplexityChart, 100);
            }
        });
    });

    // ==================== Code Editor ====================
    codeInput.addEventListener('input', updateEditorMeta);
    codeInput.addEventListener('scroll', () => {
        lineNumbers.scrollTop = codeInput.scrollTop;
    });

    // Handle Tab key in editor
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeInput.selectionStart;
            const end = codeInput.selectionEnd;
            codeInput.value = codeInput.value.substring(0, start) + '    ' + codeInput.value.substring(end);
            codeInput.selectionStart = codeInput.selectionEnd = start + 4;
            updateEditorMeta();
        }
    });

    function updateEditorMeta() {
        const code = codeInput.value;
        const lines = code.split('\n');
        charCount.textContent = code.length;
        lineCount.textContent = lines.length;

        // Update line numbers
        lineNumbers.textContent = lines.map((_, i) => i + 1).join('\n');
    }

    clearBtn.addEventListener('click', () => {
        codeInput.value = '';
        updateEditorMeta();
        codeInput.focus();
    });

    copyBtn.addEventListener('click', () => {
        if (codeInput.value) {
            navigator.clipboard.writeText(codeInput.value);
            showToast('Code copied to clipboard!');
        }
    });

    // ==================== Analysis ====================
    analyzeBtn.addEventListener('click', runAnalysis);

    // Ctrl+Enter shortcut
    codeInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runAnalysis();
        }
    });

    function runAnalysis() {
        const code = codeInput.value.trim();
        if (!code) {
            showToast('Please paste some code first!');
            return;
        }

        const lang = $('#languageSelect').value;

        // Show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.querySelector('.btn-content').style.display = 'none';
        analyzeBtn.querySelector('.btn-loading').style.display = 'flex';

        // Simulate brief processing delay for UX
        setTimeout(() => {
            const result = analyzer.analyze(code, lang);
            renderResults(result, code);

            // Update query counter
            totalQueries++;
            queryCount.textContent = totalQueries;
            localStorage.setItem('tc_queries', totalQueries);

            // Save to history
            addToHistory(result, code);

            // Reset button
            analyzeBtn.disabled = false;
            analyzeBtn.querySelector('.btn-content').style.display = 'flex';
            analyzeBtn.querySelector('.btn-loading').style.display = 'none';

            copyResultBtn.style.display = '';
        }, 600);
    }

    function renderResults(result, code) {
        if (result.error) {
            resultsBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <h3>Analysis Error</h3>
                    <p>${result.error}</p>
                </div>`;
            return;
        }

        const r = result;

        resultsBody.innerHTML = `
            <!-- Complexity Badge -->
            <div class="result-complexity">
                <div class="complexity-label">Time Complexity</div>
                <div class="complexity-value">${r.timeComplexity}</div>
                <span class="complexity-badge ${r.rating.class}">${r.rating.emoji} ${r.rating.label}</span>
            </div>

            <!-- Detail Cards -->
            <div class="result-details">
                <div class="detail-card">
                    <div class="detail-label">Best Case</div>
                    <div class="detail-value">${r.bestCase}</div>
                </div>
                <div class="detail-card">
                    <div class="detail-label">Average</div>
                    <div class="detail-value">${r.averageCase}</div>
                </div>
                <div class="detail-card">
                    <div class="detail-label">Worst Case</div>
                    <div class="detail-value">${r.worstCase}</div>
                </div>
            </div>

            <!-- Space Complexity -->
            <div class="result-details" style="margin-bottom:20px">
                <div class="detail-card" style="flex:1">
                    <div class="detail-label">Space Complexity</div>
                    <div class="detail-value">${r.spaceComplexity}</div>
                </div>
                <div class="detail-card" style="flex:1">
                    <div class="detail-label">Language</div>
                    <div class="detail-value" style="text-transform:capitalize">${r.language}</div>
                </div>
            </div>

            <!-- Explanation -->
            <div class="result-section">
                <div class="result-section-title">📖 Explanation</div>
                <div class="result-section-content">
                    <ul>
                        ${r.explanation.map(e => `<li>${e}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <!-- Optimization Tips -->
            <div class="result-section">
                <div class="result-section-title">💡 Optimization Tips</div>
                <div class="result-section-content">
                    ${r.optimizations.map(t => `<div class="optimization-tip">${t}</div>`).join('')}
                </div>
            </div>
        `;

        // Animate in
        resultsBody.style.animation = 'none';
        void resultsBody.offsetHeight; // trigger reflow
        resultsBody.style.animation = 'fadeIn 0.4s ease';
    }

    // Copy results
    copyResultBtn.addEventListener('click', () => {
        const text = resultsBody.innerText;
        if (text) {
            navigator.clipboard.writeText(text);
            showToast('Results copied to clipboard!');
        }
    });

    // ==================== History ====================
    function addToHistory(result, code) {
        const entry = {
            id: Date.now(),
            code: code.substring(0, 500),
            language: result.language,
            timeComplexity: result.timeComplexity,
            spaceComplexity: result.spaceComplexity,
            rating: result.rating,
            timestamp: new Date().toLocaleString(),
        };

        history.unshift(entry);
        if (history.length > 20) history = history.slice(0, 20);
        localStorage.setItem('tc_history', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        if (history.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        historyGrid.innerHTML = history.map(h => `
            <div class="history-card" data-code="${escapeHtml(h.code)}">
                <div class="history-card-header">
                    <span class="history-complexity">${h.timeComplexity}</span>
                    <span class="history-lang">${h.language}</span>
                </div>
                <div class="history-preview">${escapeHtml(h.code.substring(0, 120))}</div>
                <div class="history-time">${h.timestamp}</div>
            </div>
        `).join('');

        // Click to load
        historyGrid.querySelectorAll('.history-card').forEach(card => {
            card.addEventListener('click', () => {
                codeInput.value = card.dataset.code;
                updateEditorMeta();
                // Switch to analyzer tab
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                $$('.nav-btn')[0].classList.add('active');
                $$('.tab-content').forEach(t => t.classList.remove('active'));
                $('#tab-analyzer').classList.add('active');
                codeInput.focus();
                showToast('Code loaded from history!');
            });
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        history = [];
        localStorage.setItem('tc_history', '[]');
        renderHistory();
        showToast('History cleared!');
    });

    // Initial render
    queryCount.textContent = totalQueries;
    renderHistory();

    // ==================== Examples ====================
    const EXAMPLES = [
        {
            name: 'Two Sum (Hash Map)',
            complexity: 'O(n)',
            desc: 'Find two numbers that add up to a target using an unordered_map for O(1) lookups.',
            lang: 'cpp',
            code: `vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement)) {
            return {seen[complement], i};
        }
        seen[nums[i]] = i;
    }
    return {};
}`,
        },
        {
            name: 'Binary Search',
            complexity: 'O(log n)',
            desc: 'Search a sorted array by repeatedly halving the search space.',
            lang: 'cpp',
            code: `int binarySearch(vector<int>& arr, int target) {
    int lo = 0, hi = arr.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] == target)
            return mid;
        else if (arr[mid] < target)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return -1;
}`,
        },
        {
            name: 'Bubble Sort',
            complexity: 'O(n²)',
            desc: 'Repeatedly compare and swap adjacent elements. Simple but inefficient.',
            lang: 'cpp',
            code: `void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}`,
        },
        {
            name: 'Merge Sort',
            complexity: 'O(n log n)',
            desc: 'Divide the array in half, sort each half, then merge. Optimal comparison sort.',
            lang: 'cpp',
            code: `void merge(vector<int>& arr, int l, int m, int r) {
    vector<int> left(arr.begin() + l, arr.begin() + m + 1);
    vector<int> right(arr.begin() + m + 1, arr.begin() + r + 1);
    int i = 0, j = 0, k = l;
    while (i < left.size() && j < right.size()) {
        if (left[i] <= right[j])
            arr[k++] = left[i++];
        else
            arr[k++] = right[j++];
    }
    while (i < left.size()) arr[k++] = left[i++];
    while (j < right.size()) arr[k++] = right[j++];
}

void mergeSort(vector<int>& arr, int l, int r) {
    if (l >= r) return;
    int m = l + (r - l) / 2;
    mergeSort(arr, l, m);
    mergeSort(arr, m + 1, r);
    merge(arr, l, m, r);
}`,
        },
        {
            name: 'Fibonacci (Naive)',
            complexity: 'O(2^n)',
            desc: 'Classic recursive Fibonacci — exponential due to repeated subproblems.',
            lang: 'cpp',
            code: `int fibonacci(int n) {
    if (n <= 1)
        return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}`,
        },
        {
            name: 'Fibonacci (Memoized)',
            complexity: 'O(n)',
            desc: 'Fibonacci with memoization — each subproblem computed only once.',
            lang: 'cpp',
            code: `unordered_map<int, long long> memo;

long long fibonacci(int n) {
    if (memo.count(n))
        return memo[n];
    if (n <= 1)
        return n;
    memo[n] = fibonacci(n - 1) + fibonacci(n - 2);
    return memo[n];
}`,
        },
        {
            name: 'Matrix Traversal',
            complexity: 'O(n²)',
            desc: 'Visit every cell in an n×n matrix. Common in grid-based problems.',
            lang: 'cpp',
            code: `int traverseMatrix(vector<vector<int>>& matrix) {
    int n = matrix.size();
    int sum = 0;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            sum += matrix[i][j];
        }
    }
    return sum;
}`,
        },
        {
            name: 'BFS Graph Traversal',
            complexity: 'O(V + E)',
            desc: 'Breadth-first search visits all vertices and edges in a graph.',
            lang: 'cpp',
            code: `unordered_set<int> bfs(vector<vector<int>>& graph, int start) {
    unordered_set<int> visited;
    queue<int> q;
    q.push(start);
    visited.insert(start);
    while (!q.empty()) {
        int node = q.front();
        q.pop();
        for (int neighbor : graph[node]) {
            if (!visited.count(neighbor)) {
                visited.insert(neighbor);
                q.push(neighbor);
            }
        }
    }
    return visited;
}`,
        },
        {
            name: 'Constant Time Lookup',
            complexity: 'O(1)',
            desc: 'Direct access by index or key — no iteration needed.',
            lang: 'cpp',
            code: `int getElement(vector<int>& arr, int index) {
    return arr[index];
}

int getValue(unordered_map<string, int>& map, string key) {
    return map[key];
}`,
        },
    ];

    function renderExamples() {
        examplesGrid.innerHTML = EXAMPLES.map(ex => `
            <div class="example-card" data-code="${escapeHtml(ex.code)}" data-lang="${ex.lang}">
                <div class="example-header">
                    <span class="example-name">${ex.name}</span>
                    <span class="example-complexity">${ex.complexity}</span>
                </div>
                <div class="example-desc">${ex.desc}</div>
                <div class="example-code">${escapeHtml(ex.code)}</div>
            </div>
        `).join('');

        examplesGrid.querySelectorAll('.example-card').forEach(card => {
            card.addEventListener('click', () => {
                codeInput.value = card.dataset.code;
                $('#languageSelect').value = card.dataset.lang;
                updateEditorMeta();
                // Switch to analyzer tab
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                $$('.nav-btn')[0].classList.add('active');
                $$('.tab-content').forEach(t => t.classList.remove('active'));
                $('#tab-analyzer').classList.add('active');
                codeInput.focus();
                showToast('Example loaded! Click "Analyze" to see results.');
            });
        });
    }

    renderExamples();

    // ==================== Learn Tab ====================
    const COMPLEXITIES = [
        { notation: 'O(1)', name: 'Constant', color: '#00cec9', desc: 'Execution time is independent of input size. Array access, hash lookups, simple arithmetic.', example: 'arr[0], dict["key"], x + y' },
        { notation: 'O(log n)', name: 'Logarithmic', color: '#55efc4', desc: 'Halves the problem space each step. Binary search, balanced BST operations.', example: 'Binary search, finding in sorted array' },
        { notation: 'O(n)', name: 'Linear', color: '#74b9ff', desc: 'Scales directly with input size. Single pass through array, linear search.', example: 'for x in arr: process(x)' },
        { notation: 'O(n log n)', name: 'Linearithmic', color: '#fdcb6e', desc: 'Efficient sorting algorithms. Divide-and-conquer with linear merge step.', example: 'Merge sort, heap sort, Tim sort' },
        { notation: 'O(n²)', name: 'Quadratic', color: '#e17055', desc: 'Nested iteration over input. Bubble sort, brute-force pair comparisons.', example: 'for i in arr: for j in arr: ...' },
        { notation: 'O(2^n)', name: 'Exponential', color: '#d63031', desc: 'Doubles with each additional input element. Naive recursion, power set generation.', example: 'Recursive Fibonacci, subsets' },
        { notation: 'O(n!)', name: 'Factorial', color: '#fd79a8', desc: 'Grows factorially — impractical for n > ~12. Permutations, traveling salesman brute-force.', example: 'Generate all permutations' },
    ];

    function renderLearnCards() {
        learnGrid.innerHTML = COMPLEXITIES.map(c => `
            <div class="learn-card" style="border-left: 4px solid ${c.color}">
                <div class="learn-card-header">
                    <span class="learn-notation" style="color:${c.color}">${c.notation}</span>
                    <span class="learn-name">${c.name}</span>
                </div>
                <div class="learn-desc">${c.desc}</div>
                <div class="learn-example">${c.example}</div>
            </div>
        `).join('');
    }

    renderLearnCards();

    // ==================== Complexity Chart (Canvas) ====================
    function drawComplexityChart() {
        const canvas = $('#complexityChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        const W = rect.width - 64;
        const H = 320;

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.scale(dpr, dpr);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#9898b8' : '#4a4a6a';
        const gridColor = isDark ? 'rgba(100,100,255,0.08)' : 'rgba(0,0,0,0.06)';

        // Clear
        ctx.clearRect(0, 0, W, H);

        const padL = 60, padR = 30, padT = 20, padB = 50;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        // Grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padT + (plotH / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + plotW, y);
            ctx.stroke();
        }

        // Axes labels
        ctx.fillStyle = textColor;
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Input Size (n)', padL + plotW / 2, H - 5);

        ctx.save();
        ctx.translate(15, padT + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Operations', 0, 0);
        ctx.restore();

        // Functions to plot
        const maxN = 25;
        const maxOps = 200;
        const functions = [
            { label: 'O(1)', color: '#00cec9', fn: () => 1 },
            { label: 'O(log n)', color: '#55efc4', fn: (n) => Math.log2(Math.max(1, n)) },
            { label: 'O(n)', color: '#74b9ff', fn: (n) => n },
            { label: 'O(n log n)', color: '#fdcb6e', fn: (n) => n * Math.log2(Math.max(1, n)) },
            { label: 'O(n²)', color: '#e17055', fn: (n) => n * n },
            { label: 'O(2^n)', color: '#d63031', fn: (n) => Math.pow(2, n) },
        ];

        functions.forEach(({ label, color, fn }) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();

            let started = false;
            for (let n = 0; n <= maxN; n += 0.5) {
                const ops = fn(n);
                const x = padL + (n / maxN) * plotW;
                const y = padT + plotH - (Math.min(ops, maxOps) / maxOps) * plotH;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }

                if (ops > maxOps) break;
            }
            ctx.stroke();

            // Label at end of visible line
            const lastN = Math.min(maxN, (() => {
                for (let n = maxN; n >= 0; n -= 0.5) {
                    if (fn(n) <= maxOps) return n;
                }
                return 0;
            })());
            const lx = padL + (lastN / maxN) * plotW;
            const ly = padT + plotH - (Math.min(fn(lastN), maxOps) / maxOps) * plotH;

            ctx.fillStyle = color;
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(label, lx + 6, ly + 4);
        });
    }

    // Redraw on resize
    window.addEventListener('resize', () => {
        if ($('#tab-learn').classList.contains('active')) {
            drawComplexityChart();
        }
    });

    // ==================== Particle Background ====================
    function initParticles() {
        const canvas = $('#particles');
        const ctx = canvas.getContext('2d');
        let W, H;
        const particles = [];
        const PARTICLE_COUNT = 60;

        function resize() {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        class Particle {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * W;
                this.y = Math.random() * H;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.r = Math.random() * 2 + 0.5;
                this.alpha = Math.random() * 0.5 + 0.1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > W) this.vx *= -1;
                if (this.y < 0 || this.y > H) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(108, 92, 231, ${this.alpha})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new Particle());
        }

        function connectParticles() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(108, 92, 231, ${0.08 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, W, H);
            particles.forEach(p => { p.update(); p.draw(); });
            connectParticles();
            requestAnimationFrame(animate);
        }

        animate();
    }

    initParticles();

    // ==================== Toast ====================
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ==================== Utility ====================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML.replace(/"/g, '&quot;');
    }

    // ==================== Init ====================
    updateEditorMeta();

})();
