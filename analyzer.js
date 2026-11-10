/**
 * TC Analyzer — Core Analysis Engine
 * 
 * Performs static analysis of code to determine time and space complexity.
 * This runs entirely in the browser — no API calls needed.
 */

class ComplexityAnalyzer {
    constructor() {
        this.patterns = this._buildPatterns();
    }

    /**
     * Main analysis entry point
     * @param {string} code - The code to analyze
     * @param {string} language - Programming language (or 'auto')
     * @returns {object} Analysis result
     */
    analyze(code, language = 'auto') {
        if (!code || !code.trim()) {
            return { error: 'No code provided' };
        }

        const detectedLang = language === 'auto' ? this._detectLanguage(code) : language;
        const normalizedCode = this._normalizeCode(code);
        const lines = normalizedCode.split('\n').filter(l => l.trim());

        // Run analysis passes
        const loopAnalysis = this._analyzeLoops(normalizedCode, lines);
        const recursionAnalysis = this._analyzeRecursion(normalizedCode, lines);
        const dataStructureAnalysis = this._analyzeDataStructures(normalizedCode);
        const sortingAnalysis = this._analyzeSortingCalls(normalizedCode);

        // Combine findings
        const timeComplexity = this._determineTimeComplexity(
            loopAnalysis, recursionAnalysis, dataStructureAnalysis, sortingAnalysis
        );
        const spaceComplexity = this._determineSpaceComplexity(
            normalizedCode, loopAnalysis, recursionAnalysis, dataStructureAnalysis
        );

        // Build explanation
        const explanation = this._buildExplanation(
            loopAnalysis, recursionAnalysis, dataStructureAnalysis, sortingAnalysis, timeComplexity
        );
        const optimizations = this._suggestOptimizations(timeComplexity, loopAnalysis, normalizedCode);
        const rating = this._getRating(timeComplexity.notation);

        return {
            language: detectedLang,
            timeComplexity: timeComplexity.notation,
            spaceComplexity: spaceComplexity.notation,
            bestCase: timeComplexity.bestCase || timeComplexity.notation,
            worstCase: timeComplexity.worstCase || timeComplexity.notation,
            averageCase: timeComplexity.averageCase || timeComplexity.notation,
            rating,
            explanation,
            optimizations,
            details: {
                loops: loopAnalysis,
                recursion: recursionAnalysis,
                dataStructures: dataStructureAnalysis,
                sorting: sortingAnalysis,
            },
            timestamp: new Date().toISOString(),
        };
    }

    // ==================== Language Detection ====================

    _detectLanguage(code) {
        const indicators = {
            python: [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bprint\s*\(/, /:\s*$/, /\belif\b/, /\bself\b/],
            javascript: [/\bfunction\s+\w+/, /\bconst\s+/, /\blet\s+/, /=>/, /\bconsole\.log/, /\bvar\s+/],
            java: [/\bpublic\s+(?:static\s+)?(?:void|int|String|boolean)/, /\bSystem\.out/, /\bclass\s+\w+/, /\bprivate\s+/, /\bnew\s+\w+/],
            cpp: [
                /\b(?:cout|cin)\b/, /#include\s*</, /\bstd::/, /\bvector\s*</, /\bint\s+main\s*\(/,
                /\bunordered_(?:map|set)\b/, /\b(?:queue|stack|pair|priority_queue)\s*</,
                /\bnullptr\b/, /\b(?:TreeNode|ListNode)\b/, /\bpush_back\b/,
                /\bauto\s+\w+\s*=/, /\bswap\s*\(/
            ],
            c: [/#include\s*<stdio/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bmalloc\s*\(/, /\bint\s+main\s*\(/],
            go: [/\bfunc\s+\w+/, /\bpackage\s+\w+/, /\bfmt\./, /\b:=\b/, /\bgo\s+\w+/],
            typescript: [/:\s*(?:string|number|boolean|any)\b/, /\binterface\s+\w+/, /\btype\s+\w+\s*=/, /\bas\s+\w+/],
            rust: [/\bfn\s+\w+/, /\blet\s+mut\b/, /\bimpl\s+/, /\b->\s*/, /\bpub\s+fn/],
        };

        let bestMatch = 'pseudo';
        let bestScore = 0;

        for (const [lang, patterns] of Object.entries(indicators)) {
            const score = patterns.reduce((sum, pat) => sum + (pat.test(code) ? 1 : 0), 0);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = lang;
            }
        }

        return bestScore >= 1 ? bestMatch : 'pseudo';
    }

    // ==================== Normalization ====================

    _normalizeCode(code) {
        // Remove single-line comments
        let normalized = code.replace(/\/\/.*$/gm, '');
        // Remove multi-line comments
        normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove Python comments
        normalized = normalized.replace(/#.*$/gm, '');
        // Remove string literals to avoid false positives
        normalized = normalized.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '""');
        return normalized;
    }

    // ==================== Loop Analysis ====================

    _analyzeLoops(code, lines) {
        const result = {
            totalLoops: 0,
            maxNestingDepth: 0,
            loopTypes: [],
            halvingLoops: 0,
            linearLoops: 0,
            nestedStructure: [],
        };

        const loopPatterns = [
            /\bfor\s*\(/,
            /\bfor\s+\w+\s+in\b/,
            /\bwhile\s*[\(:]/, 
            /\bdo\s*\{/,
            /\.forEach\s*\(/,
            /\.map\s*\(/,
            /\.filter\s*\(/,
            /\.reduce\s*\(/,
            /\.some\s*\(/,
            /\.every\s*\(/,
            /\bfor\s+.*range\s*\(/,
        ];

        const halvingPatterns = [
            /\w+\s*\/=\s*2/,
            /\w+\s*=\s*\w+\s*\/\s*2/,
            /\w+\s*>>=\s*1/,
            /\w+\s*=\s*\w+\s*>>\s*1/,
            /(?:lo|left|low|start|l)\s*=\s*(?:mid|middle)/,
            /(?:hi|right|high|end|r)\s*=\s*(?:mid|middle)/,
            /mid\s*=\s*[\w(]+\s*[+]\s*[\w)]+\s*\/?\/?\s*2/,
        ];

        // Track nesting depth
        let currentDepth = 0;
        let maxDepth = 0;
        let nestingStack = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Check for loop patterns
            let isLoop = false;
            for (const pattern of loopPatterns) {
                if (pattern.test(trimmed)) {
                    isLoop = true;
                    result.totalLoops++;
                    
                    // Check if it's a halving loop
                    let isHalving = false;
                    // Look ahead a few lines for halving patterns
                    const lineIdx = lines.indexOf(line);
                    const lookAhead = lines.slice(lineIdx, lineIdx + 8).join('\n');
                    for (const hp of halvingPatterns) {
                        if (hp.test(lookAhead)) {
                            isHalving = true;
                            break;
                        }
                    }

                    if (isHalving) {
                        result.halvingLoops++;
                        result.loopTypes.push({ type: 'logarithmic', line: trimmed });
                    } else {
                        result.linearLoops++;
                        result.loopTypes.push({ type: 'linear', line: trimmed });
                    }
                    
                    currentDepth++;
                    nestingStack.push(trimmed);
                    if (currentDepth > maxDepth) {
                        maxDepth = currentDepth;
                        result.nestedStructure = [...nestingStack];
                    }

                    // Single-line loop statement without brace or colon (e.g., while (...) doSomething();)
                    const hasOpenBrace = trimmed.includes('{') || trimmed.endsWith(':');
                    const isMultiLine = !trimmed.endsWith(';');
                    if (!hasOpenBrace && !isMultiLine && currentDepth > 0) {
                        currentDepth--;
                        nestingStack.pop();
                    }
                    break;
                }
            }

            // Track block endings (approximate)
            const openBraces = (trimmed.match(/\{/g) || []).length;
            const closeBraces = (trimmed.match(/\}/g) || []).length;
            const netClose = closeBraces - openBraces;
            
            if (netClose > 0 && currentDepth > 0) {
                currentDepth = Math.max(0, currentDepth - netClose);
                nestingStack = nestingStack.slice(0, currentDepth);
            }
        }

        // Python-style: use indentation for nesting
        if (currentDepth > 0) {
            // Reset and re-analyze with indentation
            let indentDepths = [];
            let loopDepth = 0;
            let peakDepth = 0;
            
            for (const line of lines) {
                const indent = line.search(/\S/);
                if (indent < 0) continue;
                
                const isLoopLine = loopPatterns.some(p => p.test(line.trim()));
                
                // Pop from stack if indent decreased
                while (indentDepths.length > 0 && indent <= indentDepths[indentDepths.length - 1]) {
                    indentDepths.pop();
                    loopDepth = Math.max(0, loopDepth - 1);
                }
                
                if (isLoopLine) {
                    loopDepth++;
                    indentDepths.push(indent);
                    if (loopDepth > peakDepth) {
                        peakDepth = loopDepth;
                    }
                }
            }
            
            if (peakDepth > maxDepth) {
                maxDepth = peakDepth;
            }
        }

        result.maxNestingDepth = maxDepth;
        return result;
    }

    // ==================== Recursion Analysis ====================

    _analyzeRecursion(code, lines) {
        const result = {
            isRecursive: false,
            recursionType: null,
            branchingFactor: 1,
            hasMemoization: false,
            functionName: null,
        };

        // Find function definitions
        const reservedKeywords = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'sizeof', 'typeof', 'using', 'else', 'case', 'new', 'delete']);
        const funcPatterns = [
            /(?:def|function|func)\s+(\w+)\s*\(/g,
            /(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/g,
            /(\w+)\s*:\s*function/g,
            /(?:[\w<>*&:]+)\s+(\w+)\s*\([^)]*\)\s*\{/g,
        ];

        const functionNames = new Set();
        for (const pattern of funcPatterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                if (!reservedKeywords.has(match[1])) {
                    functionNames.add(match[1]);
                }
            }
        }

        // Check for self-calls
        for (const funcName of functionNames) {
            let body = '';
            // Try extracting brace-bounded body for C++/Java/JS
            const braceRegex = new RegExp(`\\b${funcName}\\s*\\([^)]*\\)[^{]*\\{`, 'g');
            const braceMatch = braceRegex.exec(code);
            let callOffset = 0;
            if (braceMatch) {
                const startIndex = braceMatch.index + braceMatch[0].length - 1;
                let depth = 0;
                for (let i = startIndex; i < code.length; i++) {
                    if (code[i] === '{') depth++;
                    else if (code[i] === '}') {
                        depth--;
                        if (depth === 0) {
                            body = code.substring(startIndex, i + 1);
                            break;
                        }
                    }
                }
                if (!body) body = code.substring(startIndex);
            } else {
                // Python / non-brace fallback
                const bodyRegex = new RegExp(`(?:def|function|func)\\s+${funcName}[\\s\\S]*?(?=(?:def|function|func)\\s+\\w|$)`, 's');
                const bodyMatch = code.match(bodyRegex);
                body = bodyMatch ? bodyMatch[0] : code;
                callOffset = 1; // Subtract the definition
            }

            const callPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
            const calls = body.match(callPattern);

            if (calls && calls.length > callOffset) {
                result.isRecursive = true;
                result.functionName = funcName;
                result.branchingFactor = calls.length - callOffset;

                // Check for memoization
                const memoPatterns = [
                    /\bmemo\b/i, /\bcache\b/i, /\bdp\b/, /\b@lru_cache\b/,
                    /\b@cache\b/, /\bfunctools\b/, /\bMap\s*\(\)/, /\bdict\b/,
                    /\bmemoize\b/i, /\bHashMap\b/, /\bunordered_map\b/,
                ];
                result.hasMemoization = memoPatterns.some(p => p.test(code));

                // Determine recursion type
                if (result.branchingFactor >= 2) {
                    const halvesInput = /[\w()]+\s*\/\s*2|[\w()]+\s*>>\s*1|\bmid\b|\b[lr]\s*\+\s*\(/.test(body);
                    if (halvesInput) {
                        result.recursionType = 'divide-and-conquer';
                    } else {
                        result.recursionType = result.hasMemoization ? 'memoized-branching' : 'branching';
                    }
                } else {
                    // Check if input halves
                    const halvesInput = /[\w()]+\s*\/\s*2|[\w()]+\s*>>\s*1|mid|n\s*-\s*1/.test(body);
                    if (halvesInput && (/n\s*\/\s*2|mid|len\s*\//.test(body) || /\/\s*2/.test(body))) {
                        result.recursionType = 'divide-and-conquer';
                    } else {
                        result.recursionType = 'linear';
                    }
                }
                break;
            }
        }

        return result;
    }

    // ==================== Data Structure Analysis ====================

    _analyzeDataStructures(code) {
        const result = {
            usesHashMap: false,
            usesSet: false,
            usesHeap: false,
            usesSorting: false,
            usesStack: false,
            usesQueue: false,
            usesTree: false,
            usesGraph: false,
            structures: [],
        };

        const dsPatterns = {
            hashMap: [/\bdict\b/, /\bHashMap\b/, /\bMap\b/, /\bunordered_map\b/, /\b{}\s*$/, /\bObject\.create\b/, /\bdefaultdict\b/],
            set: [/\bset\(/, /\bHashSet\b/, /\bnew\s+Set\b/, /\bunordered_set\b/],
            heap: [/\bheapq\b/, /\bPriorityQueue\b/, /\bheap\b/i, /\bpriority_queue\b/],
            sorting: [/\.sort\s*\(/, /\bsorted\s*\(/, /\bArrays\.sort\b/, /\bCollections\.sort\b/, /\bstd::sort\b/],
            stack: [/\bstack\b/i, /\.push\s*\(/, /\.pop\s*\(/],
            queue: [/\bqueue\b/i, /\bdeque\b/, /\bQueue\b/, /\.enqueue\b/, /\.dequeue\b/],
            tree: [/\bTreeNode\b/, /\bBST\b/, /\bright\s*=/, /\bleft\s*=/, /\.left\b/, /\.right\b/],
            graph: [/\bgraph\b/i, /\badjacency\b/i, /\bneighbors\b/, /\bedges\b/, /\bvisited\b/],
        };

        for (const [ds, patterns] of Object.entries(dsPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(code)) {
                    result[`uses${ds.charAt(0).toUpperCase() + ds.slice(1)}`] = true;
                    if (!result.structures.includes(ds)) {
                        result.structures.push(ds);
                    }
                    break;
                }
            }
        }

        return result;
    }

    // ==================== Sorting Calls ====================

    _analyzeSortingCalls(code) {
        const sortPatterns = [
            /\.sort\s*\(/, /\bsorted\s*\(/, /\bArrays\.sort\b/,
            /\bCollections\.sort\b/, /\bstd::sort\b/, /\bsort\.Slice\b/,
        ];
        
        const hasSorting = sortPatterns.some(p => p.test(code));
        return { hasSorting };
    }

    // ==================== Determine Time Complexity ====================

    _determineTimeComplexity(loops, recursion, ds, sorting) {
        let complexity = 'O(1)';
        let bestCase = 'O(1)';
        let worstCase = 'O(1)';

        // Start with loop analysis
        if (loops.totalLoops === 0 && !recursion.isRecursive && !sorting.hasSorting) {
            // No loops, no recursion
            return { notation: 'O(1)', bestCase: 'O(1)', worstCase: 'O(1)', averageCase: 'O(1)' };
        }

        // Handle graph traversal algorithms (BFS / DFS: queue/stack + visited set/vector)
        if (ds.usesGraph && (ds.usesQueue || ds.usesStack || ds.usesSet)) {
            return {
                notation: 'O(V + E)',
                bestCase: 'O(1)',
                worstCase: 'O(V + E)',
                averageCase: 'O(V + E)',
            };
        }

        // Handle recursion
        if (recursion.isRecursive) {
            if (recursion.recursionType === 'branching' && !recursion.hasMemoization) {
                if (recursion.branchingFactor === 2) {
                    complexity = 'O(2^n)';
                    bestCase = 'O(2^n)';
                    worstCase = 'O(2^n)';
                } else {
                    complexity = `O(${recursion.branchingFactor}^n)`;
                    bestCase = complexity;
                    worstCase = complexity;
                }
            } else if (recursion.recursionType === 'memoized-branching') {
                complexity = 'O(n)';
                bestCase = 'O(1)';
                worstCase = 'O(n)';
            } else if (recursion.recursionType === 'divide-and-conquer') {
                if (recursion.branchingFactor >= 2) {
                    complexity = 'O(n log n)';
                    bestCase = 'O(n log n)';
                    worstCase = 'O(n log n)';
                } else {
                    complexity = 'O(log n)';
                    bestCase = 'O(1)';
                    worstCase = 'O(log n)';
                }
            } else if (recursion.recursionType === 'linear') {
                complexity = 'O(n)';
                bestCase = 'O(1)';
                worstCase = 'O(n)';
            }
        }

        // Handle loops
        if (loops.totalLoops > 0) {
            const depth = loops.maxNestingDepth;

            if (depth === 1 && loops.halvingLoops > 0 && loops.linearLoops === 0) {
                const loopComplexity = 'O(log n)';
                complexity = this._maxComplexity(complexity, loopComplexity);
                bestCase = 'O(1)';
                worstCase = this._maxComplexity(worstCase, loopComplexity);
            } else if (depth === 1 && loops.linearLoops > 0 && loops.halvingLoops === 0) {
                const loopComplexity = 'O(n)';
                complexity = this._maxComplexity(complexity, loopComplexity);
                bestCase = this._maxComplexity(bestCase, 'O(1)');
                worstCase = this._maxComplexity(worstCase, loopComplexity);
            } else if (depth === 1 && loops.linearLoops > 0 && loops.halvingLoops > 0) {
                const loopComplexity = 'O(n log n)';
                complexity = this._maxComplexity(complexity, loopComplexity);
                bestCase = this._maxComplexity(bestCase, 'O(n log n)');
                worstCase = this._maxComplexity(worstCase, loopComplexity);
            } else if (depth >= 2) {
                if (loops.halvingLoops === depth) {
                    const loopComplexity = `O(log^${depth} n)`;
                    complexity = this._maxComplexity(complexity, loopComplexity);
                } else if (loops.halvingLoops > 0) {
                    const linearDepth = depth - loops.halvingLoops;
                    const loopComplexity = linearDepth === 1 ? 'O(n log n)' : `O(n^${linearDepth} log n)`;
                    complexity = this._maxComplexity(complexity, loopComplexity);
                    worstCase = this._maxComplexity(worstCase, loopComplexity);
                } else {
                    const loopComplexity = depth === 2 ? 'O(n²)' : `O(n^${depth})`;
                    complexity = this._maxComplexity(complexity, loopComplexity);
                    bestCase = this._maxComplexity(bestCase, loopComplexity);
                    worstCase = this._maxComplexity(worstCase, loopComplexity);
                }
            }
        }

        // Handle sorting
        if (sorting.hasSorting) {
            complexity = this._maxComplexity(complexity, 'O(n log n)');
            worstCase = this._maxComplexity(worstCase, 'O(n log n)');
            if (bestCase === 'O(1)') bestCase = 'O(n)';
        }

        return {
            notation: complexity,
            bestCase,
            worstCase,
            averageCase: complexity,
        };
    }

    // ==================== Determine Space Complexity ====================

    _determineSpaceComplexity(code, loops, recursion, ds) {
        let space = 'O(1)';

        // Check for array/list creation inside loops or proportional to input
        const arrayCreation = [
            /\[\s*\]\s*\*\s*n/, /\bnew\s+(?:Array|int|String)\s*\[/, /\bList\b/, 
            /\[\s*0\s*\]\s*\*/, /\bmake\s*\(\s*\[\s*\]/, /\bvec!\s*\[/,
            /\[\s*\w+\s+for\s+\w+\s+in\b/, // list comprehension
        ];

        const createsArray = arrayCreation.some(p => p.test(code));
        
        if (createsArray) {
            space = 'O(n)';
        }

        if (ds.usesHashMap || ds.usesSet) {
            space = 'O(n)';
        }

        if (ds.usesGraph) {
            space = 'O(V + E)';
        }

        if (recursion.isRecursive) {
            if (recursion.recursionType === 'branching' && !recursion.hasMemoization) {
                space = 'O(n)'; // call stack
            } else if (recursion.recursionType === 'memoized-branching') {
                space = 'O(n)'; // memo table
            } else if (recursion.recursionType === 'divide-and-conquer') {
                space = this._maxComplexity(space, 'O(log n)');
            } else {
                space = this._maxComplexity(space, 'O(n)');
            }
        }

        // 2D arrays
        if (/\[\s*\[\s*\]|\[\s*\[0\]|dp\s*\[.*\]\s*\[/.test(code)) {
            space = 'O(n²)';
        }

        return { notation: space };
    }

    // ==================== Complexity Comparison ====================

    _complexityRank(notation) {
        const ranks = {
            'O(1)': 1,
            'O(log n)': 2,
            'O(n)': 3,
            'O(n log n)': 4,
            'O(n²)': 5,
            'O(n^2)': 5,
            'O(n^3)': 6,
            'O(n³)': 6,
            'O(2^n)': 7,
            'O(3^n)': 8,
            'O(n!)': 9,
        };
        return ranks[notation] || 5;
    }

    _maxComplexity(a, b) {
        return this._complexityRank(a) >= this._complexityRank(b) ? a : b;
    }

    // ==================== Rating ====================

    _getRating(complexity) {
        const rank = this._complexityRank(complexity);
        if (rank <= 1) return { label: 'Excellent', class: 'badge-excellent', emoji: '🏆' };
        if (rank <= 2) return { label: 'Great', class: 'badge-good', emoji: '✅' };
        if (rank <= 3) return { label: 'Good', class: 'badge-good', emoji: '👍' };
        if (rank <= 4) return { label: 'Fair', class: 'badge-fair', emoji: '⚠️' };
        if (rank <= 5) return { label: 'Poor', class: 'badge-poor', emoji: '⚠️' };
        return { label: 'Needs Optimization', class: 'badge-bad', emoji: '🔴' };
    }

    // ==================== Build Explanation ====================

    _buildExplanation(loops, recursion, ds, sorting, tc) {
        const points = [];

        if (loops.totalLoops === 0 && !recursion.isRecursive && !sorting.hasSorting) {
            points.push('The code performs a constant number of operations regardless of input size.');
            points.push('No loops, recursion, or sorting operations detected.');
            return points;
        }

        if (loops.totalLoops > 0) {
            points.push(`Found ${loops.totalLoops} loop(s) with a maximum nesting depth of ${loops.maxNestingDepth}.`);
            
            if (loops.linearLoops > 0) {
                points.push(`${loops.linearLoops} loop(s) iterate linearly over the input — each contributes O(n).`);
            }
            if (loops.halvingLoops > 0) {
                points.push(`${loops.halvingLoops} loop(s) halve the search space each iteration — each contributes O(log n).`);
            }
            if (loops.maxNestingDepth >= 2) {
                points.push(`Nested loops multiply their complexities: depth ${loops.maxNestingDepth} nesting.`);
            }
        }

        if (recursion.isRecursive) {
            points.push(`Recursive function "${recursion.functionName}" detected.`);
            if (recursion.recursionType === 'branching') {
                points.push(`The function branches into ${recursion.branchingFactor} recursive calls, leading to exponential growth.`);
            } else if (recursion.recursionType === 'memoized-branching') {
                points.push('Memoization detected — repeated subproblems are cached, reducing exponential to linear.');
            } else if (recursion.recursionType === 'divide-and-conquer') {
                points.push('Divide-and-conquer pattern detected — input is halved at each level.');
            } else {
                points.push('Linear recursion — each call reduces the problem by a constant amount.');
            }
        }

        if (sorting.hasSorting) {
            points.push('A sorting operation is used, which contributes O(n log n) to the overall complexity.');
        }

        if (ds.structures.length > 0) {
            const dsNames = ds.structures.map(s => {
                const names = { hashMap: 'Hash Map', set: 'Set', heap: 'Heap/Priority Queue', stack: 'Stack', queue: 'Queue', tree: 'Tree', graph: 'Graph' };
                return names[s] || s;
            });
            points.push(`Data structures used: ${dsNames.join(', ')}.`);
            if (ds.usesHashMap || ds.usesSet) {
                points.push('Hash-based lookups provide O(1) average-case access time.');
            }
        }

        return points;
    }

    // ==================== Suggest Optimizations ====================

    _suggestOptimizations(tc, loops, code) {
        const tips = [];
        const rank = this._complexityRank(tc.notation);

        if (rank >= 7) {
            tips.push('Consider using dynamic programming with memoization to cache repeated subproblems.');
            tips.push('Look for overlapping subproblems that can be stored and reused.');
        }

        if (rank >= 5 && loops.maxNestingDepth >= 2) {
            tips.push('Try reducing nested loops by using a hash map/set for O(1) lookups instead of inner loops.');
            tips.push('Consider sorting the data first to enable binary search (O(n log n) + O(log n) vs O(n²)).');
        }

        if (rank >= 4) {
            tips.push('Check if the problem has a two-pointer or sliding window solution for linear time.');
        }

        if (rank === 1) {
            tips.push('This code is already optimal at O(1) — no further optimization needed! 🎉');
        } else if (rank === 2) {
            tips.push('O(log n) is excellent for search operations. Already well optimized!');
        } else if (rank === 3) {
            tips.push('O(n) is generally considered efficient for problems that must examine all input elements.');
        }

        return tips;
    }

    // ==================== Build Patterns ====================

    _buildPatterns() {
        // Reserved for future pattern expansions
        return {};
    }
}

// Export
window.ComplexityAnalyzer = ComplexityAnalyzer;
