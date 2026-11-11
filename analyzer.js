/**
 * TC Analyzer — Core Analysis Engine (v2)
 *
 * Multi-pass static analysis that models loop iteration counts,
 * recursion branching / Master-Theorem application, library-call costs,
 * and space usage. Runs entirely in the browser — zero dependencies.
 *
 * Public API: const result = new ComplexityAnalyzer().analyze(code, lang?)
 * Result shape is identical to v1 so app.js requires no changes.
 */

class ComplexityAnalyzer {
    constructor() {
        this._libCosts = this._buildLibCosts();
    }

    /* ==================================================================
       PUBLIC
       ================================================================== */

    analyze(code, language = 'auto') {
        if (!code || !code.trim()) return { error: 'No code provided' };

        const detectedLang = language === 'auto' ? this._detectLanguage(code) : language;
        const isPython = detectedLang === 'python';
        const norm = this._normalize(code, isPython);

        const funcs    = this._extractFunctions(norm, isPython);
        const loopInfo = this._analyzeLoops(norm, isPython);
        const recInfo  = this._analyzeRecursion(norm, funcs, isPython);
        const dsInfo   = this._analyzeDataStructures(norm);
        const libInfo  = this._analyzeLibraryCalls(norm, loopInfo);
        const sortInfo = this._analyzeSorting(norm, loopInfo);

        const time  = this._determineTime(loopInfo, recInfo, dsInfo, libInfo, sortInfo);
        const space = this._determineSpace(norm, loopInfo, recInfo, dsInfo);

        const explanation   = this._buildExplanation(loopInfo, recInfo, dsInfo, libInfo, sortInfo, time);
        const optimizations = this._suggestOptimizations(time, loopInfo, norm);
        const rating        = this._getRating(time.notation);

        return {
            language: detectedLang,
            timeComplexity:  time.notation,
            spaceComplexity: space.notation,
            bestCase:    time.bestCase    || time.notation,
            worstCase:   time.worstCase   || time.notation,
            averageCase: time.averageCase || time.notation,
            rating,
            explanation,
            optimizations,
            details: {
                loops:          loopInfo,
                recursion:      recInfo,
                dataStructures: dsInfo,
                sorting:        sortInfo,
            },
            timestamp: new Date().toISOString(),
        };
    }

    /* ==================================================================
       LANGUAGE DETECTION
       ================================================================== */

    _detectLanguage(code) {
        const indicators = {
            python:     [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bprint\s*\(/, /:\s*$/m, /\belif\b/, /\bself\b/],
            javascript: [/\bfunction\s+\w+/, /\bconst\s+/, /\blet\s+/, /=>/, /\bconsole\.log/, /\bvar\s+/],
            java:       [/\bpublic\s+(?:static\s+)?(?:void|int|String|boolean)/, /\bSystem\.out/, /\bclass\s+\w+/, /\bprivate\s+/, /\bnew\s+\w+/],
            cpp: [
                /\b(?:cout|cin)\b/, /#include\s*</, /\bstd::/, /\bvector\s*</,
                /\bint\s+main\s*\(/, /\bunordered_(?:map|set)\b/,
                /\b(?:queue|stack|pair|priority_queue)\s*</,
                /\bnullptr\b/, /\b(?:TreeNode|ListNode)\b/, /\bpush_back\b/,
                /\bauto\s+\w+\s*=/, /\bswap\s*\(/,
                /\bint\s+\w+\s*\([^)]*\)\s*\{/, /\bvoid\s+\w+\s*\([^)]*\)\s*\{/,
                /\bbool\s+\w+\s*\([^)]*\)\s*\{/, /\blong\s+long\b/
            ],
            c:          [/#include\s*<stdio/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bmalloc\s*\(/, /\bint\s+main\s*\(/],
            go:         [/\bfunc\s+\w+/, /\bpackage\s+\w+/, /\bfmt\./, /\b:=\b/, /\bgo\s+\w+/],
            typescript: [/:\s*(?:string|number|boolean|any)\b/, /\binterface\s+\w+/, /\btype\s+\w+\s*=/, /\bas\s+\w+/],
            rust:       [/\bfn\s+\w+/, /\blet\s+mut\b/, /\bimpl\s+/, /\b->\s*/, /\bpub\s+fn/],
        };
        let best = 'pseudo', bestScore = 0;
        for (const [lang, pats] of Object.entries(indicators)) {
            const s = pats.reduce((a, p) => a + (p.test(code) ? 1 : 0), 0);
            if (s > bestScore) { bestScore = s; best = lang; }
        }
        return bestScore >= 1 ? best : 'pseudo';
    }

    /* ==================================================================
       NORMALIZATION
       ================================================================== */

    _normalize(code, isPython) {
        let s = code;
        if (!isPython) s = s.replace(/\/\/.*$/gm, '');
        s = s.replace(/\/\*[\s\S]*?\*\//g, '');
        if (isPython) s = s.replace(/^([^'"#]*(?:(?:'[^']*'|"[^"]*")[^'"#]*)*)#.*$/gm, '$1');
        s = s.replace(/("""|'''|"|'|`)[\s\S]*?\1/g, '""');
        return s;
    }

    /* ==================================================================
       FUNCTION EXTRACTION
       ================================================================== */

    _extractFunctions(code, isPython) {
        const funcs = [];
        const reserved = new Set([
            'if','else','while','for','switch','catch','return','sizeof',
            'typeof','using','case','new','delete','do','try','class',
        ]);

        const pats = [
            /(?:def)\s+(\w+)\s*\(/g,
            /(?:function)\s+(\w+)\s*\(/g,
            /(?:func)\s+(\w+)\s*\(/g,
            /(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/g,
            /(\w+)\s*:\s*function/g,
            /(?:[\w<>&*:\[\]]+)\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{/g,
        ];

        for (const p of pats) {
            let m;
            while ((m = p.exec(code)) !== null) {
                const name = m[1];
                if (reserved.has(name)) continue;
                const body = this._extractBody(code, m.index + m[0].length, isPython);
                if (body) funcs.push({ name, body, offset: m.index });
            }
        }
        return funcs;
    }

    _extractBody(code, afterHeader, isPython) {
        if (isPython) {
            const defLineStart = code.lastIndexOf('\n', afterHeader) + 1;
            const defIndent = code.substring(defLineStart).search(/\S/);
            const lines = code.substring(afterHeader).split('\n');
            const bodyLines = [];
            for (let i = 1; i < lines.length; i++) {
                const l = lines[i];
                if (l.trim() === '') { bodyLines.push(l); continue; }
                const ind = l.search(/\S/);
                if (ind <= defIndent) break;
                bodyLines.push(l);
            }
            return bodyLines.join('\n');
        }

        let start = code.lastIndexOf('{', afterHeader);
        if (start === -1) start = code.indexOf('{', afterHeader);
        if (start === -1) return null;
        let depth = 0;
        for (let i = start; i < code.length; i++) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') {
                depth--;
                if (depth === 0) return code.substring(start + 1, i);
            }
        }
        return code.substring(start + 1);
    }

    /* ==================================================================
       LOOP ANALYSIS
       ================================================================== */

    _analyzeLoops(code, isPython) {
        const result = {
            totalLoops: 0,
            maxNestingDepth: 0,
            loopTypes: [],
            nestedStructure: [],
            combinedComplexity: null,
        };

        const ast = this._buildLoopTree(code, isPython);
        if (ast.length === 0) return result;

        const all = this._flattenLoopTree(ast);
        result.totalLoops = all.length;
        result.maxNestingDepth = all.reduce((m, n) => Math.max(m, n.depth), 0);
        result.loopTypes = all.map(n => ({
            type: n.iterType,
            line: n.headerLine,
            complexity: n.iterType,
        }));
        result.nestedStructure = all.filter(n => n.depth === result.maxNestingDepth)
            .map(n => n.headerLine);

        const topComplexities = ast.map(n => this._loopTreeComplexity(n, code));
        result.combinedComplexity = topComplexities.reduce(
            (a, b) => this._maxC(a, b), C1
        );

        return result;
    }

    _buildLoopTree(code, isPython) {
        const lines = code.split('\n');
        const loopRe = /\b(for|while|do)\b/;
        const nodes = [];
        const depthStack = [];

        let braceDepth = 0;
        const useIndent = isPython;

        for (let li = 0; li < lines.length; li++) {
            const raw = lines[li];
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const indent = raw.search(/\S/);
            const isHOF = /\.(forEach|map|filter|reduce|flatMap|some|every)\s*\(/.test(trimmed);
            const isLoop = loopRe.test(trimmed) || isHOF;

            if (useIndent) {
                while (depthStack.length && depthStack[depthStack.length - 1].indent >= indent) {
                    depthStack.pop();
                }
            } else {
                for (const ch of trimmed) {
                    if (ch === '{') braceDepth++;
                    else if (ch === '}') {
                        braceDepth--;
                        while (depthStack.length && depthStack[depthStack.length - 1].targetBrace > braceDepth) {
                            depthStack.pop();
                        }
                    }
                }
            }

            if (isLoop) {
                const parentIdx = depthStack.length ? depthStack[depthStack.length - 1].nodeIdx : -1;
                const depth = depthStack.length + 1;

                const lookAhead = lines.slice(li, Math.min(li + 12, lines.length)).join('\n');
                const bodyLines = this._extractLoopBodyLines(lines, li, isPython);
                const iterType = this._classifyLoop(trimmed, lookAhead, bodyLines);

                const node = {
                    index: nodes.length,
                    depth,
                    parentIdx,
                    children: [],
                    headerLine: trimmed,
                    iterType,
                    lineNo: li,
                    lookAhead,
                };
                nodes.push(node);

                if (parentIdx >= 0) nodes[parentIdx].children.push(node);

                if (useIndent) {
                    depthStack.push({ indent, nodeIdx: node.index });
                } else {
                    if (trimmed.includes('{')) {
                        depthStack.push({
                            targetBrace: braceDepth,
                            nodeIdx: node.index,
                        });
                    }
                }
            }
        }

        return nodes.filter(n => n.parentIdx === -1);
    }

    _extractLoopBodyLines(lines, startLi, isPython) {
        const body = [];
        if (isPython) {
            const headerIndent = lines[startLi].search(/\S/);
            for (let i = startLi + 1; i < lines.length; i++) {
                const l = lines[i];
                if (!l.trim()) continue;
                if (l.search(/\S/) <= headerIndent) break;
                body.push(l);
            }
            return body;
        }

        let brace = 0;
        let foundOpen = false;
        for (let i = startLi; i < lines.length; i++) {
            const l = lines[i];
            for (const ch of l) {
                if (ch === '{') { brace++; foundOpen = true; }
                else if (ch === '}') { brace--; }
            }
            if (i > startLi) body.push(l);
            if (foundOpen && brace === 0) break;
        }
        return body;
    }

    _flattenLoopTree(roots) {
        const out = [];
        const walk = (n) => { out.push(n); n.children.forEach(walk); };
        roots.forEach(walk);
        return out;
    }

    _classifyLoop(header, lookAhead, bodyLines) {
        if (this._isConstantEarlyExit(bodyLines)) return 'constant';
        if (this._isTwoPointer(header, lookAhead)) return 'amortized-linear';

        const forMatch = header.match(/\bfor\s*\(\s*[^;]*;\s*([^;]*);\s*([^)]*)\)/);
        if (forMatch) {
            const cond   = forMatch[1].trim();
            const update = forMatch[2].trim();
            return this._classifyForLoop(cond, update, lookAhead);
        }

        const rangeMatch = header.match(/\bfor\s+\w+\s+in\s+range\s*\(([^)]*)\)/);
        if (rangeMatch) {
            return 'linear';
        }

        if (/\bwhile\b/.test(header)) {
            return this._classifyWhileLoop(lookAhead);
        }

        if (/\.(forEach|map|filter|reduce|flatMap|some|every)\s*\(/.test(header)) {
            return 'linear';
        }

        if (/\bfor\s+\w+\s+in\b/.test(header)) return 'linear';

        return 'linear';
    }

    _classifyForLoop(cond, update, lookAhead) {
        if (/\w+\s*\*=\s*\d+/.test(update) ||
            /\w+\s*<<=/.test(update) ||
            /\w+\s*=\s*\w+\s*\*\s*\d+/.test(update)) {
            return 'logarithmic';
        }
        if (/\w+\s*\/=\s*\d+/.test(update) ||
            /\w+\s*>>=/.test(update) ||
            /\w+\s*=\s*\w+\s*\/\s*\d+/.test(update)) {
            return 'logarithmic';
        }
        if (/(\w+)\s*=\s*\1\s*\*\s*\1/.test(update)) return 'loglog';
        if (/(\w+)\s*\*\s*\1\s*</.test(cond) || /sqrt/i.test(cond)) return 'sqrt';

        if (/(\w+)\s*\+=\s*(\w+)/.test(update)) {
            const [, loopVar, stepVar] = update.match(/(\w+)\s*\+=\s*(\w+)/);
            if (stepVar !== loopVar && !/^\d+$/.test(stepVar)) return 'harmonic';
        }

        return 'linear';
    }

    _classifyWhileLoop(lookAhead) {
        const halvingPats = [
            /\w+\s*\/=\s*2/, /\w+\s*=\s*\w+\s*\/\s*2/,
            /\w+\s*>>=\s*1/, /\w+\s*=\s*\w+\s*>>\s*1/,
            /(?:lo|left|low|start|l)\s*=\s*(?:mid|middle)/,
            /(?:hi|right|high|end|r)\s*=\s*(?:mid|middle)/,
            /mid\s*=\s*[\w(]+\s*[+]\s*[\w)]+\s*\/?\/?\/?\s*2/,
        ];
        if (halvingPats.some(p => p.test(lookAhead))) return 'logarithmic';

        if (/(\w+)\s*=\s*\1\s*\*\s*\1/.test(lookAhead)) return 'loglog';
        if (/(\w+)\s*\*\s*\1\s*</.test(lookAhead) || /sqrt/i.test(lookAhead)) return 'sqrt';

        return 'linear';
    }

    _isConstantEarlyExit(bodyLines) {
        if (!bodyLines || bodyLines.length === 0) return false;
        const content = bodyLines.map(l => l.trim()).filter(l => l && l !== '{' && l !== '}');
        if (content.length === 0) return false;
        const hasLoop = content.some(l => /\b(for|while)\b/.test(l));
        if (hasLoop) return false;
        const first = content[0];
        return /^(return|break)\b/.test(first);
    }

    _isTwoPointer(header, lookAhead) {
        if (!/\bfor\b/.test(header)) return false;
        const innerWhile = lookAhead.match(/\bwhile\s*\([^)]*\)/);
        if (!innerWhile) return false;
        const bodyAfterWhile = lookAhead.substring(lookAhead.indexOf(innerWhile[0]));
        const innerVar = innerWhile[0].match(/\b(\w+)\s*[<>]/);
        if (!innerVar) return false;
        const varName = innerVar[1];
        const resetPat = new RegExp(`\\b${varName}\\s*=\\s*(?:0|${varName}|\\bi\\b)`);
        if (resetPat.test(bodyAfterWhile)) return false;
        return true;
    }

    _loopTreeComplexity(node, code) {
        if (node.iterType === 'amortized-linear') {
            return { n: 1, logn: 0, label: 'O(n)' };
        }

        const self = this._iterTypeToComplexity(node.iterType);
        if (node.children.length === 0) return self;

        if (node.iterType === 'linear' &&
            node.children.length === 1 &&
            node.children[0].iterType === 'harmonic') {
            return { n: 1, logn: 1, label: 'O(n log n)' };
        }

        if (node.iterType === 'sqrt' &&
            node.children.length === 1 &&
            node.children[0].iterType === 'harmonic') {
            return { loglogn: 1, n: 1, label: 'O(n log log n)' };
        }

        const childComplexities = node.children.map(c => this._loopTreeComplexity(c, code));
        const maxChild = childComplexities.reduce((a, b) => this._maxC(a, b), C1);
        return this._multiplyC(self, maxChild);
    }

    _iterTypeToComplexity(type) {
        switch (type) {
            case 'constant':         return C1;
            case 'logarithmic':      return { n: 0, logn: 1, label: 'O(log n)' };
            case 'loglog':           return { n: 0, logn: 0, loglogn: 1, label: 'O(log log n)' };
            case 'sqrt':             return { n: 0.5, logn: 0, label: 'O(√n)' };
            case 'linear':           return { n: 1, logn: 0, label: 'O(n)' };
            case 'harmonic':         return { n: 1, logn: 0, label: 'O(n)' };
            case 'amortized-linear': return { n: 1, logn: 0, label: 'O(n)' };
            default:                 return { n: 1, logn: 0, label: 'O(n)' };
        }
    }

    /* ==================================================================
       RECURSION ANALYSIS
       ================================================================== */

    _analyzeRecursion(code, funcs, isPython) {
        const result = {
            isRecursive: false,
            recursionType: null,
            branchingFactor: 1,
            hasMemoization: false,
            functionName: null,
        };

        const memoSignals = [
            /\bmemo\b/i, /\bcache\b/i, /\bdp\s*[\[({]/, /\bdp\b/,
            /@lru_cache\b/, /@cache\b/, /\bfunctools\b/,
            /\bmemoize\b/i,
            /!=\s*-1\b/, /!=\s*INT_MAX\b/, /!=\s*nullptr\b/,
            /\bvisited\b/,
        ];
        const hasMemo = memoSignals.some(p => p.test(code));

        for (const fn of funcs) {
            const callRe = new RegExp(`\\b${fn.name}\\s*\\(`, 'g');
            const calls = (fn.body.match(callRe) || []);
            if (calls.length === 0) continue;

            result.isRecursive = true;
            result.functionName = fn.name;
            result.hasMemoization = hasMemo;

            result.branchingFactor = this._countBranches(fn.body, fn.name);

            const body = fn.body;
            const halvesInput = /[\w()]+\s*\/\s*2|[\w()]+\s*>>\s*1|\bmid\b|\.size\(\)\s*\/\s*2|len\s*\(\s*\w+\s*\)\s*\/\s*2|\bpartition\b|\bpi\b|\bpivot\b/.test(body);

            const hasLoopWithRecCall = new RegExp(`\\bfor\\b[\\s\\S]*?\\b${fn.name}\\s*\\([\\s\\S]*?\\}`).test(body);

            if (hasLoopWithRecCall) {
                result.branchingFactor = 2;
                result.recursionType = 'branching';
            } else if (result.branchingFactor >= 2 && halvesInput) {
                result.recursionType = 'divide-and-conquer';
            } else if (result.branchingFactor >= 2 && hasMemo) {
                result.recursionType = 'memoized-branching';
            } else if (result.branchingFactor >= 2) {
                result.recursionType = 'branching';
            } else if (halvesInput) {
                result.recursionType = 'divide-and-conquer';
            } else {
                result.recursionType = 'linear';
            }
            break;
        }

        return result;
    }

    _countBranches(body, fnName) {
        const re = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
        const lines = body.split('\n');
        let maxOnOneLine = 0;
        for (const line of lines) {
            const m = line.match(re);
            if (m) maxOnOneLine = Math.max(maxOnOneLine, m.length);
        }
        if (maxOnOneLine >= 2) return maxOnOneLine;

        let nonReturnCalls = 0;
        for (const line of lines) {
            const m = line.match(re);
            if (!m) continue;
            if (!/^return\b/.test(line.trim())) {
                nonReturnCalls += m.length;
            }
        }
        if (nonReturnCalls >= 2) return nonReturnCalls;

        return Math.max(1, maxOnOneLine);
    }

    /* ==================================================================
       DATA STRUCTURE ANALYSIS
       ================================================================== */

    _analyzeDataStructures(code) {
        const result = {
            usesHashMap: false,
            usesSet: false,
            usesOrderedMap: false,
            usesOrderedSet: false,
            usesHeap: false,
            usesSorting: false,
            usesStack: false,
            usesQueue: false,
            usesTree: false,
            usesGraph: false,
            structures: [],
        };

        const dsPatterns = {
            hashMap:    [/\bunordered_map\b/, /\bdict\b/, /\bHashMap\b/, /\bdefaultdict\b/],
            set:        [/\bunordered_set\b/, /\bset\(/, /\bHashSet\b/, /\bnew\s+Set\b/],
            orderedMap: [/\bmap\s*</, /\bTreeMap\b/, /\bstd::map\b/],
            orderedSet: [/\bset\s*<(?!.*unordered)/, /\bTreeSet\b/, /\bstd::set\b/],
            heap:       [/\bheapq\b/, /\bPriorityQueue\b/, /\bpriority_queue\b/],
            stack:      [/\bstack\s*</, /\bStack\b/],
            queue:      [/\bqueue\s*</, /\bdeque\b/, /\bQueue\b/],
            tree:       [/\bTreeNode\b/, /\bBST\b/, /->left\b/, /->right\b/, /\.left\b/, /\.right\b/],
            graph:      [/\bgraph\b/i, /\badjacency\b/i, /\bneighbors\b/, /\bedges\b/, /\bvisited\b/],
        };

        for (const [ds, pats] of Object.entries(dsPatterns)) {
            for (const p of pats) {
                if (p.test(code)) {
                    const key = 'uses' + ds.charAt(0).toUpperCase() + ds.slice(1);
                    result[key] = true;
                    if (!result.structures.includes(ds)) result.structures.push(ds);
                    break;
                }
            }
        }
        return result;
    }

    /* ==================================================================
       LIBRARY-CALL COST ANALYSIS
       ================================================================== */

    _buildLibCosts() {
        return {
            'vector.erase':      { n: 1 },
            'vector.insert':     { n: 1 },
            'vector.push_back':  { n: 0 },
            'vector.pop_back':   { n: 0 },
            'string.+':          { n: 1 },
            'string.+=':         { n: 1 },
            'string.substr':     { n: 1 },
            'string.find':       { n: 1 },
            'map.[]':            { logn: 1 },
            'map.insert':        { logn: 1 },
            'map.find':          { logn: 1 },
            'map.erase':         { logn: 1 },
            'map.count':         { logn: 1 },
            'set.insert':        { logn: 1 },
            'set.find':          { logn: 1 },
            'set.erase':         { logn: 1 },
            'set.count':         { logn: 1 },
            'unordered_map.[]':  { n: 0 },
            'unordered_set.insert': { n: 0 },
        };
    }

    _analyzeLibraryCalls(code, loopInfo) {
        const result = { costs: [], maxLoopBodyCost: C1 };

        const lines = code.split('\n');
        let loopDepth = 0;
        for (const line of lines) {
            const t = line.trim();
            if (/\b(for|while|do)\b/.test(t) || /\.(forEach|map|filter|reduce)\s*\(/.test(t)) {
                loopDepth++;
            }

            if (loopDepth > 0) {
                if (/\.erase\s*\(/.test(t) || /\.insert\s*\(\s*\w+\.begin\s*\(\)/.test(t)) {
                    result.costs.push({ op: 'vector.erase/insert', cost: 'O(n)', line: t });
                    result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 1 });
                }
                if ((/\w+\s*=\s*\w+\s*\+/.test(t) || /\w+\s*\+=/.test(t)) && /string|str\b/i.test(code)) {
                    result.costs.push({ op: 'string concat', cost: 'O(n)', line: t });
                    result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 1 });
                }
                if (/\bmap\s*</.test(code) || /\bset\s*</.test(code)) {
                    if (/\.\s*(?:insert|find|erase|count|lower_bound|upper_bound)\s*\(/.test(t) ||
                        /\[\s*\w/.test(t)) {
                        result.costs.push({ op: 'ordered map/set op', cost: 'O(log n)', line: t });
                        result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 0, logn: 1 });
                    }
                }
            }

            const opens = (t.match(/\{/g) || []).length;
            const closes = (t.match(/\}/g) || []).length;
            loopDepth = Math.max(0, loopDepth - (closes - opens));
        }

        return result;
    }

    /* ==================================================================
       SORTING ANALYSIS
       ================================================================== */

    _analyzeSorting(code, loopInfo) {
        const sortPats = [
            /\.sort\s*\(/, /\bsorted\s*\(/, /\bArrays\.sort\b/,
            /\bCollections\.sort\b/, /\bstd::sort\b/, /\bsort\s*\(/,
            /\bstable_sort\s*\(/,
        ];

        const hasSorting = sortPats.some(p => p.test(code));
        let sortInsideLoop = false;

        if (hasSorting && loopInfo && loopInfo.totalLoops > 0) {
            let loopDepth = 0;
            for (const line of code.split('\n')) {
                const t = line.trim();
                const isLoopHeader = /\b(for|while|do)\b/.test(t) || /\.(forEach|map|filter)\s*\(/.test(t);
                if (isLoopHeader) loopDepth++;
                if (loopDepth > 0 && sortPats.some(p => p.test(t)) && !isLoopHeader) {
                    sortInsideLoop = true;
                }
                const opens  = (t.match(/\{/g) || []).length;
                const closes = (t.match(/\}/g) || []).length;
                if (!isLoopHeader) {
                    loopDepth = Math.max(0, loopDepth - closes);
                } else {
                    loopDepth = Math.max(0, loopDepth - (closes - opens));
                }
            }
        }

        return { hasSorting, sortInsideLoop };
    }

    /* ==================================================================
       DETERMINE TIME COMPLEXITY
       ================================================================== */

    _determineTime(loops, rec, ds, lib, sort) {
        let tc = C1;
        let best = C1;
        let worst = C1;

        const nothingFound = loops.totalLoops === 0 && !rec.isRecursive && !sort.hasSorting;
        if (nothingFound) {
            return { notation: 'O(1)', bestCase: 'O(1)', worstCase: 'O(1)', averageCase: 'O(1)' };
        }

        if (ds.usesGraph && (ds.usesQueue || ds.usesStack || ds.usesSet || ds.usesHashMap)) {
            return {
                notation: 'O(V + E)',
                bestCase: 'O(1)',
                worstCase: 'O(V + E)',
                averageCase: 'O(V + E)',
            };
        }

        if (rec.isRecursive) {
            const rt = rec.recursionType;
            const b  = rec.branchingFactor;

            if (rt === 'branching') {
                tc = worst = best = { n: 0, exp: b, label: `O(${b}^n)` };
            } else if (rt === 'memoized-branching') {
                tc = worst = { n: 1, logn: 0, label: 'O(n)' };
                best = C1;
            } else if (rt === 'divide-and-conquer') {
                if (b >= 2) {
                    tc = best = worst = { n: 1, logn: 1, label: 'O(n log n)' };
                } else {
                    tc = worst = { n: 0, logn: 1, label: 'O(log n)' };
                    best = C1;
                }
            } else {
                tc = worst = { n: 1, logn: 0, label: 'O(n)' };
                best = C1;
            }
        }

        if (loops.combinedComplexity) {
            const lc = loops.combinedComplexity;
            const withLib = this._multiplyC(lc, lib.maxLoopBodyCost);

            if (rec.isRecursive && rec.recursionType === 'divide-and-conquer' && rec.branchingFactor >= 2) {
                // In divide-and-conquer (e.g. mergeSort), helper loops represent O(n) merge work
                // T(n) = 2T(n/2) + O(n) => O(n log n) by Master Theorem
                tc = worst = { n: 1, logn: 1, label: 'O(n log n)' };
            } else {
                tc    = this._maxC(tc, withLib);
                worst = this._maxC(worst, withLib);
                best  = this._maxC(best, C1);
            }
        }

        if (sort.hasSorting) {
            if (sort.sortInsideLoop) {
                const sortInLoop = this._multiplyC(
                    loops.combinedComplexity || { n: 1 },
                    { n: 1, logn: 1 }
                );
                tc    = this._maxC(tc, sortInLoop);
                worst = this._maxC(worst, sortInLoop);
            } else {
                const nlogn = { n: 1, logn: 1, label: 'O(n log n)' };
                tc    = this._maxC(tc, nlogn);
                worst = this._maxC(worst, nlogn);
                best  = this._maxC(best, { n: 1, logn: 0 });
            }
        }

        return {
            notation:    this._cToString(tc),
            bestCase:    this._cToString(best),
            worstCase:   this._cToString(worst),
            averageCase: this._cToString(tc),
        };
    }

    /* ==================================================================
       DETERMINE SPACE COMPLEXITY
       ================================================================== */

    _determineSpace(code, loops, rec, ds) {
        let sp = C1;

        const linearAlloc = [
            /\bvector\s*<[^>]*>\s*\w+\s*\(\s*\w/,
            /\bnew\s+(?:int|long|bool|char|String|double)\s*\[/,
            /\[\s*\]\s*\*\s*\w/,
            /\[\s*0\s*\]\s*\*\s*\w/,
            /\[\s*\w+\s+for\s+\w+\s+in\b/,
            /\bmake\s*\(\s*\[\s*\]/,
            /\bvec!\s*\[/,
            /\bvector\s*<\s*bool\s*>/,
        ];
        if (linearAlloc.some(p => p.test(code))) {
            sp = this._maxC(sp, { n: 1 });
        }

        if (ds.usesHashMap || ds.usesSet || ds.usesOrderedMap || ds.usesOrderedSet) {
            sp = this._maxC(sp, { n: 1 });
        }

        if (ds.usesGraph) {
            sp = this._maxC(sp, { n: 1 });
        }

        const twoDAlloc = [
            /vector\s*<\s*vector\s*<[^>]+>\s*>\s*\w+\s*\(/,
            /\bdp\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]\s*=/,
            /new\s+\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/,
            /\[\s*\[\s*0\s*\]\s*\*\s*\w+\s*for\s/,
        ];
        if (twoDAlloc.some(p => p.test(code))) {
            sp = this._maxC(sp, { n: 2 });
        }

        if (rec.isRecursive) {
            if (rec.recursionType === 'divide-and-conquer') {
                sp = this._maxC(sp, { n: 0, logn: 1 });
            } else if (rec.recursionType === 'memoized-branching') {
                sp = this._maxC(sp, { n: 1 });
            } else if (rec.recursionType === 'branching') {
                sp = this._maxC(sp, { n: 1 });
            } else {
                sp = this._maxC(sp, { n: 1 });
            }
        }

        if (/\bstring\b/i.test(code) || /\bstr\b/.test(code)) {
            let inLoop = false;
            for (const line of code.split('\n')) {
                if (/\b(for|while)\b/.test(line)) inLoop = true;
                if (inLoop && /\w+\s*\+=\s*/.test(line) && !/\b\d+\b/.test(line.split('+=')[1])) {
                    sp = this._maxC(sp, { n: 1 });
                    break;
                }
                if (/\}/.test(line)) inLoop = false;
            }
        }

        return { notation: this._cToString(sp) };
    }

    /* ==================================================================
       COMPLEXITY ALGEBRA
       ================================================================== */

    _maxC(a, b) {
        const ra = this._cRank(a), rb = this._cRank(b);
        return ra >= rb ? a : b;
    }

    _multiplyC(a, b) {
        if (this._isC1(a)) return b;
        if (this._isC1(b)) return a;
        if (a.exp) return a;
        if (b.exp) return b;
        return {
            n:    (a.n || 0) + (b.n || 0),
            logn: (a.logn || 0) + (b.logn || 0),
        };
    }

    _isC1(c) {
        if (!c) return true;
        if (c.label === 'O(1)') return true;
        if (c.label && c.label !== 'O(1)') return false;
        return !c.exp && !c.loglogn && (c.n || 0) === 0 && (c.logn || 0) === 0;
    }

    _cRank(c) {
        if (!c || this._isC1(c)) return 0;
        if (c.label === 'O(V + E)') return 35;
        if (c.exp) return 100 + (c.exp || 2);
        if (c.loglogn) return 32;
        const n = c.n || 0, logn = c.logn || 0;
        if (n === 0 && logn > 0) return 10 * logn;
        if (n === 0.5) return 15;
        return n * 30 + logn * 10;
    }

    _cToString(c) {
        if (!c || this._isC1(c)) return 'O(1)';
        if (c.label) return c.label;
        if (c.exp) return `O(${c.exp}^n)`;
        if (c.loglogn) return 'O(n log log n)';
        const n = c.n || 0, logn = c.logn || 0;
        if (n === 0 && logn === 1) return 'O(log n)';
        if (n === 0 && logn === 2) return 'O(log² n)';
        if (n === 0.5 && logn === 0) return 'O(√n)';
        if (n === 1 && logn === 0) return 'O(n)';
        if (n === 1 && logn === 1) return 'O(n log n)';
        if (n === 2 && logn === 0) return 'O(n²)';
        if (n === 2 && logn === 1) return 'O(n² log n)';
        if (n === 3 && logn === 0) return 'O(n³)';
        if (n > 0 && logn > 0) {
            const nPart = n === 1 ? 'n' : `n^${n}`;
            const logPart = logn === 1 ? 'log n' : `log^${logn} n`;
            return `O(${nPart} ${logPart})`;
        }
        if (n > 0) return n === 1 ? 'O(n)' : `O(n^${n})`;
        return 'O(1)';
    }

    /* ==================================================================
       RANKING & RATING
       ================================================================== */

    _complexityRank(notation) {
        const ranks = {
            'O(1)': 1,
            'O(log log n)': 1.5,
            'O(log n)': 2,
            'O(log² n)': 2.5,
            'O(√n)': 2.7,
            'O(n)': 3,
            'O(n log log n)': 3.8,
            'O(n log n)': 4,
            'O(V + E)': 3.5,
            'O(n√n)': 4.5,
            'O(n²)': 5,
            'O(n^2)': 5,
            'O(n² log n)': 5.5,
            'O(n^3)': 6,
            'O(n³)': 6,
            'O(2^n)': 7,
            'O(2^n · n)': 7.5,
            'O(3^n)': 8,
            'O(n!)': 9,
        };
        return ranks[notation] || 5;
    }

    _getRating(complexity) {
        const rank = this._complexityRank(complexity);
        if (rank <= 1)   return { label: 'Excellent', class: 'badge-excellent', emoji: '🏆' };
        if (rank <= 2.5) return { label: 'Great',     class: 'badge-good',      emoji: '✅' };
        if (rank <= 3)   return { label: 'Good',      class: 'badge-good',      emoji: '👍' };
        if (rank <= 4)   return { label: 'Fair',      class: 'badge-fair',      emoji: '⚠️' };
        if (rank <= 5)   return { label: 'Poor',      class: 'badge-poor',      emoji: '⚠️' };
        return { label: 'Needs Optimization', class: 'badge-bad', emoji: '🔴' };
    }

    /* ==================================================================
       EXPLANATION
       ================================================================== */

    _buildExplanation(loops, rec, ds, lib, sort, tc) {
        const points = [];

        if (loops.totalLoops === 0 && !rec.isRecursive && !sort.hasSorting) {
            points.push('The code performs a constant number of operations regardless of input size.');
            return points;
        }

        if (loops.totalLoops > 0) {
            points.push(`Found ${loops.totalLoops} loop(s) with maximum nesting depth ${loops.maxNestingDepth}.`);
            const types = [...new Set(loops.loopTypes.map(l => l.type))];
            for (const t of types) {
                const count = loops.loopTypes.filter(l => l.type === t).length;
                const desc = {
                    'linear':           'iterates linearly — O(n) each',
                    'logarithmic':      'halves search space — O(log n) each',
                    'loglog':           'squares the iterator — O(log log n) each',
                    'sqrt':             'runs up to √n iterations each',
                    'harmonic':         'harmonic step (j += i) — combined with outer gives O(n log n)',
                    'amortized-linear': 'two-pointer / amortized — O(n) total across all outer iterations',
                    'constant':         'exits in constant time (early return / break)',
                }[t] || `${t}`;
                points.push(`${count} loop(s): ${desc}.`);
            }
        }

        if (lib.costs.length > 0) {
            for (const c of lib.costs) {
                points.push(`Hidden cost: ${c.op} is ${c.cost} per call inside a loop.`);
            }
        }

        if (rec.isRecursive) {
            points.push(`Recursive function "${rec.functionName}" detected.`);
            if (rec.recursionType === 'branching') {
                points.push(`Branches into ${rec.branchingFactor} recursive calls → exponential O(${rec.branchingFactor}^n).`);
            } else if (rec.recursionType === 'memoized-branching') {
                points.push('Memoization detected — exponential branching reduced to O(n).');
            } else if (rec.recursionType === 'divide-and-conquer') {
                points.push(`Divide-and-conquer: ${rec.branchingFactor} branch(es) halving input → Master Theorem applies.`);
            } else {
                points.push('Linear recursion — each call reduces the problem by a constant.');
            }
        }

        if (sort.hasSorting) {
            if (sort.sortInsideLoop) {
                points.push('⚠️ Sorting inside a loop — multiplies sort cost O(n log n) by loop iterations.');
            } else {
                points.push('Sorting contributes O(n log n).');
            }
        }

        if (ds.structures.length > 0) {
            const names = ds.structures.map(s => ({
                hashMap: 'Hash Map (O(1) avg)', set: 'Hash Set (O(1) avg)',
                orderedMap: 'Ordered Map (O(log n))', orderedSet: 'Ordered Set (O(log n))',
                heap: 'Heap / Priority Queue', stack: 'Stack', queue: 'Queue',
                tree: 'Tree', graph: 'Graph',
            }[s] || s));
            points.push(`Data structures: ${names.join(', ')}.`);
        }

        return points;
    }

    /* ==================================================================
       OPTIMIZATIONS
       ================================================================== */

    _suggestOptimizations(tc, loops, code) {
        const tips = [];
        const rank = this._complexityRank(tc.notation);

        if (rank >= 7) {
            tips.push('Consider dynamic programming / memoization to cache overlapping subproblems.');
        }
        if (rank >= 5) {
            tips.push('Try replacing inner loops with hash map/set lookups for O(1) access.');
            tips.push('Consider sorting + binary search or two-pointer techniques.');
        }
        if (rank >= 4) {
            tips.push('Check for a sliding-window or two-pointer O(n) solution.');
        }
        if (rank <= 1) {
            tips.push('Already O(1) — optimal! 🎉');
        } else if (rank <= 2) {
            tips.push('O(log n) is excellent for search. Well optimized!');
        } else if (rank <= 3) {
            tips.push('O(n) is efficient for problems that must examine every element.');
        }
        return tips;
    }

    _buildPatterns() { return {}; }
}

const C1 = Object.freeze({ n: 0, logn: 0, label: 'O(1)' });

if (typeof window !== 'undefined') window.ComplexityAnalyzer = ComplexityAnalyzer;
if (typeof module !== 'undefined') module.exports = ComplexityAnalyzer;
