/**
 * TC Analyzer — Core Analysis Engine (v4)
 *
 * Multi-pass static analysis that models loop iteration counts,
 * recursion branching / Master-Theorem application, language-specific costs,
 * control-flow best/average/worst cases, and auxiliary space usage.
 * Runs entirely in the browser — zero dependencies.
 *
 * Public API: const result = new ComplexityAnalyzer().analyze(code, lang?)
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

        if (this._isPlainText(code)) {
            return {
                error: 'Input appears to be plain text or a description rather than code. Please paste a programming code snippet (e.g., C++, Python, Java, JavaScript, Go).'
            };
        }

        // Reject input with no analysable content (emoji, punctuation, whitespace).
        const alnumCount = (code.match(/[A-Za-z0-9]/g) || []).length;
        if (alnumCount < 3) {
            return { error: 'Not enough code to analyse. Paste a function or loop and try again.' };
        }

        const detectedLang = language === 'auto' ? this._detectLanguage(code) : language;
        const isPython = detectedLang === 'python';
        const norm = this._normalize(code, isPython);

        const funcs    = this._extractFunctions(norm, isPython);
        const loopInfo = this._analyzeLoops(norm, isPython);
        const recInfo  = this._analyzeRecursion(norm, funcs, isPython);
        const dsInfo   = this._analyzeDataStructures(norm);
        const libInfo  = this._analyzeLibraryCalls(norm, loopInfo, isPython);
        const sortInfo = this._analyzeSorting(norm, loopInfo);

        const time  = this._determineTime(loopInfo, recInfo, dsInfo, libInfo, sortInfo, norm, isPython);
        const space = this._determineSpace(norm, loopInfo, recInfo, dsInfo, isPython);

        const explanation   = this._buildExplanation(loopInfo, recInfo, dsInfo, libInfo, sortInfo, time, space);
        const optimizations = this._suggestOptimizations(time, loopInfo, norm);
        const rating        = this._getRating(time.notation);

        const isUncertain = Boolean(time.isUncertain || space.isUncertain || loopInfo.isUncertain || recInfo.isUncertain);
        const assumptions = [
            ...(loopInfo.assumptions || []),
            ...(recInfo.assumptions || []),
            ...(time.assumptions || []),
            ...(space.assumptions || [])
        ];
        const uniqueAssumptions = [...new Set(assumptions)];

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
            isUncertain,
            confidence: isUncertain ? 'uncertain' : 'high',
            assumptions: uniqueAssumptions,
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
       PLAIN TEXT / NON-CODE DETECTION
       ================================================================== */

    _isPlainText(code) {
        const trimmed = code.trim();
        if (!trimmed) return true;

        const codePunctuation = /[{};]|=>|->|::|#include|\b(?:int|void|float|double|char|bool|boolean|const|let|var|def|func|function|class|public|private|return|cout|cin|printf|scanf|System\.out|console\.log|unordered_map|unordered_set|vector<|auto\b)\b/;
        const loopOrControl = /\b(for\s*\(|while\s*\(|if\s*\(|switch\s*\(|for\s+\w+\s+in\s+|while\s+[^:\n]+:|for\s+[^;{]+;)/;

        const hasCodePunct = codePunctuation.test(trimmed);
        const hasControl = loopOrControl.test(trimmed);

        const englishWords = /\b(the|this|that|these|those|is|are|was|were|with|from|have|has|had|would|should|could|what|which|how|why|who|where|when|there|their|they|about|into|through|because|please|help|hello|hi|hey|can\s+you|tell\s+me|explain|paragraph|essay|sentence|article)\b/gi;
        const englishMatches = trimmed.match(englishWords) || [];

        const proseSentenceEnds = /[.?!](\s+[A-Z]|$)/g;
        const sentenceEndMatches = trimmed.match(proseSentenceEnds) || [];

        if (!hasCodePunct && !hasControl) {
            if (englishMatches.length >= 2 || sentenceEndMatches.length >= 1) {
                return true;
            }
        }

        const words = trimmed.split(/\s+/).filter(w => w.length > 0);
        if (words.length > 8 && (englishMatches.length / words.length) > 0.35 && !trimmed.includes('{') && !trimmed.includes(';')) {
            return true;
        }

        return false;
    }

    /* ==================================================================
       LANGUAGE DETECTION
       ================================================================== */

    _detectLanguage(code) {
        const indicators = {
            python:     [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bprint\s*\(/, /:\s*$/m, /\belif\b/, /\bself\b/, /\bfor\s+\w+\s+in\s+range\b/],
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
            go:         [/\bfunc\s+\w+/, /\bpackage\s+\w+/, /\bfmt\./, /\b:=\b/, /\bgo\s+\w+/, /\bfor\s+[\w\s:=;<>+*-]+\{/],
            typescript: [/:\s*(?:string|number|boolean|any)\b/, /\binterface\s+\w+/, /\btype\s+\w+\s*=/, /\bas\s+\w+/],
            rust:       [/\bfn\s+\w+/, /\blet\s+mut\b/, /\bimpl\s+/, /\b->\s*/, /\bpub\s+fn/],
        };
        let best = 'pseudo', bestScore = 0;
        for (const [lang, pats] of Object.entries(indicators)) {
            const s = pats.reduce((a, p) => a + (p.test(code) ? 1 : 0), 0);
            if (s > bestScore) { bestScore = s; best = lang; }
        }

        // C vs C++ disambiguation: C headers/IO with no C++-only constructs.
        const cOnly  = /#include\s*<(?:stdio|stdlib|string|math|ctype|conio|stdbool)\.h>|\b(?:printf|scanf|malloc|calloc|realloc|fgets|puts|fprintf)\s*\(/;
        const cppOnly = /#include\s*<(?:iostream|vector|string|algorithm|map|set|queue|stack|unordered_map|unordered_set)>|\b(?:cout|cin|std::|vector\s*<|unordered_map|unordered_set|template\s*<|public\s*:|private\s*:)/;
        if (best === 'cpp' && cOnly.test(code) && !cppOnly.test(code)) {
            best = 'c';
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
       DELIMITER MATCHING HELPERS
       ================================================================== */

    _findMatchingParen(str, openIdx) {
        let depth = 0;
        for (let i = openIdx; i < str.length; i++) {
            if (str[i] === '(') depth++;
            else if (str[i] === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    _findMatchingBrace(str, openIdx) {
        let depth = 0;
        for (let i = openIdx; i < str.length; i++) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    _findStatementEnd(str, startIdx) {
        let parenDepth = 0;
        let braceDepth = 0;
        for (let i = startIdx; i < str.length; i++) {
            const ch = str[i];
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
            else if (ch === '{') braceDepth++;
            else if (ch === '}') {
                braceDepth--;
                if (braceDepth <= 0 && parenDepth <= 0) return i;
            } else if (ch === ';' && parenDepth === 0 && braceDepth === 0) {
                return i;
            }
        }
        return str.length - 1;
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
            combinedWorst: null,
            combinedBest: null,
            combinedAverage: null,
            isUncertain: false,
            assumptions: [],
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
            hasEarlyReturn: n.hasEarlyReturn,
            hasBreak: n.hasBreak,
        }));
        result.nestedStructure = all.filter(n => n.depth === result.maxNestingDepth)
            .map(n => n.headerLine);

        const nodeResults = ast.map(n => this._loopTreeNodeComplexity(n, code));

        result.combinedWorst = nodeResults.map(r => r.worst).reduce(
            (a, b) => this._maxC(a, b), C1
        );
        result.combinedBest = nodeResults.map(r => r.best).reduce(
            (a, b) => this._maxC(a, b), C1
        );
        result.combinedAverage = result.combinedWorst;
        result.combinedComplexity = result.combinedWorst;

        result.isUncertain = nodeResults.some(r => r.isUncertain);
        for (const r of nodeResults) {
            if (r.assumptions && r.assumptions.length > 0) {
                result.assumptions.push(...r.assumptions);
            }
        }

        return result;
    }

    _buildLoopTree(code, isPython) {
        if (isPython) {
            return this._buildPythonLoopTree(code);
        }
        if (/^\s*(?:FOR|WHILE|REPEAT|LOOP|FOR EACH)\b/m.test(code)) {
            return this._buildPseudoLoopTree(code);
        }
        return this._buildCLoopTree(code);
    }

    /**
     * Indentation-based loop tree for pseudocode (FOR x = 0 TO n DO / WHILE c DO).
     */
    _buildPseudoLoopTree(code) {
        const lines = code.split('\n');
        const headerRe = /^\s*(FOR(?:\s+EACH)?\b.*\bDO\b|WHILE\b.*\bDO\b|REPEAT\b|LOOP\b|END\s*\w*)/i;
        const loops = [];
        const stack = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const indent = line.search(/\S/);
            const m = line.match(headerRe);
            if (!m) continue;
            const kw = m[1].toUpperCase();

            if (/^END\b/.test(kw)) {
                while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
                continue;
            }
            while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
            if (!/^(?:FOR|WHILE|REPEAT|LOOP)\b/.test(kw)) continue;

            const header = line.trim();
            const node = {
                index: loops.length, lineNo: i, indent, headerLine: header, body: '',
                iterType: 'linear', hasEarlyReturn: false, hasBreak: false,
                isUncertain: false, assumption: undefined, children: [], parentIdx: -1,
                depth: 1, endLine: lines.length,
            };

            const toConst = /\bTO\s+\d+\b/i.test(header);
            if (/^FOR\b/i.test(header) && toConst) node.iterType = 'constant';
            else if (/^WHILE\b/i.test(header) && /\/\s*2|\/\/\s*2|HALV/i.test(header)) node.iterType = 'logarithmic';

            if (stack.length) {
                node.parentIdx = stack[stack.length - 1].index;
                loops[node.parentIdx].children.push(node);
            }
            loops.push(node);
            stack.push(node);
        }

        for (const node of loops) {
            let end = lines.length;
            for (const other of loops) {
                if (other.lineNo > node.lineNo && other.indent <= node.indent) end = Math.min(end, other.lineNo);
            }
            node.endLine = end;
            node.body = lines.slice(node.lineNo + 1, end).join('\n');
            node.hasEarlyReturn = /\bRETURN\b|\bEXIT\b|\bBREAK\b/i.test(node.body);
        }

        const setDepth = (n, d) => { n.depth = d; n.children.forEach(c => setDepth(c, d + 1)); };
        loops.filter(n => n.parentIdx === -1).forEach(n => setDepth(n, 1));
        return loops.filter(n => n.parentIdx === -1);
    }

    _buildCLoopTree(code) {
        // Matches C/C++/Java/JS for(...), Go for init; cond; update {, Go for cond {, while(...), do-while, HOFs
        const loopRegex = /\b(for\s*\(|for\s+[^;{]+;[^;{]+;[^{]+\{|for\s+[a-zA-Z0-9_<>=! .]+\{|while\s*\(|while\s+[^{]+\{|do\b|\.(?:forEach|map|filter|reduce|flatMap)\s*\()/g;
        const loops = [];
        let match;
        const doWhilePositions = new Set();

        while ((match = loopRegex.exec(code)) !== null) {
            const matchStr = match[1];
            const startIndex = match.index;

            if (doWhilePositions.has(startIndex)) {
                continue;
            }

            let keyword = '';
            let headerEndIndex = -1;
            let header = '';

            if (matchStr.startsWith('for')) {
                keyword = 'for';
                if (code[match.index + 3] === '(' || code.indexOf('(', startIndex) < code.indexOf('{', startIndex) && code.indexOf('(', startIndex) !== -1) {
                    const openParen = code.indexOf('(', startIndex);
                    const closeParen = this._findMatchingParen(code, openParen);
                    if (closeParen !== -1) {
                        headerEndIndex = closeParen;
                        header = code.substring(startIndex, closeParen + 1);
                    }
                } else {
                    // Go-style for loop without parentheses
                    const braceIdx = code.indexOf('{', startIndex);
                    if (braceIdx !== -1) {
                        headerEndIndex = braceIdx - 1;
                        header = code.substring(startIndex, braceIdx).trim();
                    }
                }
            } else if (matchStr.startsWith('while')) {
                keyword = 'while';
                const openParen = code.indexOf('(', startIndex);
                if (openParen !== -1 && (code.indexOf('{', startIndex) === -1 || openParen < code.indexOf('{', startIndex))) {
                    const closeParen = this._findMatchingParen(code, openParen);
                    if (closeParen !== -1) {
                        headerEndIndex = closeParen;
                        header = code.substring(startIndex, closeParen + 1);
                    }
                } else {
                    const braceIdx = code.indexOf('{', startIndex);
                    if (braceIdx !== -1) {
                        headerEndIndex = braceIdx - 1;
                        header = code.substring(startIndex, braceIdx).trim();
                    }
                }
            } else if (matchStr.startsWith('do')) {
                keyword = 'do';
                headerEndIndex = startIndex + 1;
                header = 'do';
            } else if (matchStr.startsWith('.')) {
                keyword = 'hof';
                const openParen = code.indexOf('(', startIndex);
                const closeParen = this._findMatchingParen(code, openParen);
                if (closeParen !== -1) {
                    headerEndIndex = closeParen;
                    header = code.substring(startIndex, closeParen + 1);
                }
            }

            if (headerEndIndex === -1) continue;

            let bodyStartIndex = headerEndIndex + 1;
            while (bodyStartIndex < code.length && /\s/.test(code[bodyStartIndex])) {
                bodyStartIndex++;
            }

            let bodyEndIndex = -1;
            if (bodyStartIndex < code.length && code[bodyStartIndex] === '{') {
                const closeBrace = this._findMatchingBrace(code, bodyStartIndex);
                bodyEndIndex = closeBrace !== -1 ? closeBrace + 1 : code.length;

                if (keyword === 'do') {
                    const afterBrace = code.substring(bodyEndIndex);
                    const whileMatch = afterBrace.match(/^\s*while\s*\(/);
                    if (whileMatch) {
                        const whileIdx = bodyEndIndex + afterBrace.indexOf('while');
                        doWhilePositions.add(whileIdx);
                        const openP = code.indexOf('(', whileIdx);
                        const closeP = this._findMatchingParen(code, openP);
                        const semi = code.indexOf(';', closeP);
                        bodyEndIndex = semi !== -1 ? semi + 1 : (closeP !== -1 ? closeP + 1 : bodyEndIndex);
                    }
                }
            } else {
                const stmtEnd = this._findStatementEnd(code, bodyStartIndex);
                bodyEndIndex = stmtEnd + 1;
            }

            const body = code.substring(bodyStartIndex, bodyEndIndex).trim();
            const classification = this._classifyLoop(header.trim(), body, code, false);

            loops.push({
                index: loops.length,
                keyword,
                startIndex,
                headerEndIndex,
                bodyStartIndex,
                bodyEndIndex,
                headerLine: header.trim(),
                body,
                iterType: classification.type,
                hasEarlyReturn: classification.hasEarlyReturn,
                hasBreak: classification.hasBreak,
                isUncertain: classification.isUncertain,
                assumption: classification.assumption,
                children: [],
                parentIdx: -1,
                depth: 1
            });
        }

        for (let i = 0; i < loops.length; i++) {
            let bestParent = -1;
            let minSpan = Infinity;
            for (let j = 0; j < loops.length; j++) {
                if (i === j) continue;
                if (loops[i].startIndex >= loops[j].bodyStartIndex && loops[i].startIndex < loops[j].bodyEndIndex) {
                    const span = loops[j].bodyEndIndex - loops[j].bodyStartIndex;
                    if (span < minSpan) {
                        minSpan = span;
                        bestParent = j;
                    }
                }
            }
            if (bestParent !== -1) {
                loops[i].parentIdx = bestParent;
                loops[bestParent].children.push(loops[i]);
            }
        }

        function setDepth(node, d) {
            node.depth = d;
            for (const ch of node.children) {
                setDepth(ch, d + 1);
            }
        }
        for (const l of loops) {
            if (l.parentIdx === -1) {
                setDepth(l, 1);
            }
        }

        return loops.filter(n => n.parentIdx === -1);
    }

    _buildPythonLoopTree(code) {
        const lines = code.split('\n');
        const loops = [];
        const loopPattern = /^\s*(?:for\s+[\w\s,()]+\s+in\s+.*:|while\s+.*:)/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (loopPattern.test(line)) {
                const indent = line.search(/\S/);
                const header = line.trim();
                const bodyLines = [];
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j];
                    if (!nextLine.trim()) {
                        bodyLines.push(nextLine);
                        continue;
                    }
                    const nextIndent = nextLine.search(/\S/);
                    if (nextIndent <= indent) break;
                    bodyLines.push(nextLine);
                }
                const body = bodyLines.join('\n');
                const classification = this._classifyLoop(header, body, code, true);

                loops.push({
                    index: loops.length,
                    lineNo: i,
                    indent,
                    headerLine: header,
                    body,
                    iterType: classification.type,
                    hasEarlyReturn: classification.hasEarlyReturn,
                    hasBreak: classification.hasBreak,
                    isUncertain: classification.isUncertain,
                    assumption: classification.assumption,
                    children: [],
                    parentIdx: -1,
                    depth: 1
                });
            }
        }

        for (let i = 0; i < loops.length; i++) {
            let bestParent = -1;
            for (let j = 0; j < loops.length; j++) {
                if (i === j) continue;
                if (loops[i].lineNo > loops[j].lineNo && loops[i].indent > loops[j].indent) {
                    if (bestParent === -1 || loops[j].indent > loops[bestParent].indent) {
                        bestParent = j;
                    }
                }
            }
            if (bestParent !== -1) {
                loops[i].parentIdx = bestParent;
                loops[bestParent].children.push(loops[i]);
            }
        }

        function setDepth(node, d) {
            node.depth = d;
            for (const ch of node.children) {
                setDepth(ch, d + 1);
            }
        }
        for (const l of loops) {
            if (l.parentIdx === -1) {
                setDepth(l, 1);
            }
        }

        return loops.filter(n => n.parentIdx === -1);
    }

    _flattenLoopTree(roots) {
        const out = [];
        const walk = (n) => { out.push(n); n.children.forEach(walk); };
        roots.forEach(walk);
        return out;
    }

    /* ==================================================================
       LOOP CLASSIFICATION
       ================================================================== */

    _classifyLoop(header, body, fullCode, isPython) {
        const hasEarlyReturn = /\breturn\b|\bthrow\b/.test(body);
        const hasBreak = /\bbreak\b/.test(body);

        if (this._isConstantEarlyExit(body)) {
            return { type: 'constant', hasEarlyReturn: true, hasBreak, isUncertain: false };
        }
        if (this._isTwoPointer(header, body)) {
            return { type: 'amortized-linear', hasEarlyReturn, hasBreak, isUncertain: false };
        }

        // C / JS / Java / Go for loop with parentheses
        const forMatch = header.match(/\bfor\s*\(\s*([^;]*);\s*([^;]*);\s*([^)]*)\)/);
        if (forMatch) {
            const init   = forMatch[1].trim();
            const cond   = forMatch[2].trim();
            const update = forMatch[3].trim();
            const type = this._classifyForLoop(cond, update, body, init);
            return { type, hasEarlyReturn, hasBreak, isUncertain: type === 'uncertain' };
        }

        // Go-style for loop: for init; cond; update
        const goForMatch = header.match(/\bfor\s+([^;{]+);\s*([^;{]+);\s*([^{]+)/);
        if (goForMatch) {
            const init   = goForMatch[1].trim();
            const cond   = goForMatch[2].trim();
            const update = goForMatch[3].trim();
            const type = this._classifyForLoop(cond, update, body, init);
            return { type, hasEarlyReturn, hasBreak, isUncertain: type === 'uncertain' };
        }

        // Python for in range(...)
        const rangeMatch = header.match(/\bfor\s+[\w\s,()]+\s+in\s+range\s*\(([^)]*)\)/);
        if (rangeMatch) {
            const rawArgs = rangeMatch[1].trim();
            if (rawArgs) {
                const args = rawArgs.split(',').map(a => a.trim());
                // If all range arguments are numeric constants (e.g. range(10), range(0, 10, 2)) -> O(1)
                const allConst = args.length > 0 && args.every(a => /^-?\d+$/.test(a));
                if (allConst) {
                    return { type: 'constant', hasEarlyReturn, hasBreak, isUncertain: false };
                }
            }
            return { type: 'linear', hasEarlyReturn, hasBreak, isUncertain: false };
        }

        // Fixed collections in Python or JS/Go (e.g. for x in [1, 2, 3]:)
        const fixedCollMatch = header.match(/\bfor\s+[\w\s,()]+\s+in\s*(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})/);
        if (fixedCollMatch) {
            const inner = fixedCollMatch[1].slice(1, -1).trim();
            const items = inner ? inner.split(',').map(x => x.trim()) : [];
            const allLiteral = items.every(x => /^(?:-?\d+|["'].*["']|true|false)$/i.test(x));
            if (allLiteral) {
                return { type: 'constant', hasEarlyReturn, hasBreak, isUncertain: false };
            }
        }

        // Rust range: for i in 0..10
        const rustRangeMatch = header.match(/\bfor\s+\w+\s+in\s+(\d+)\.\.(\d+)/);
        if (rustRangeMatch) {
            return { type: 'constant', hasEarlyReturn, hasBreak, isUncertain: false };
        }

        if (/\bwhile\b/.test(header)) {
            const whileRes = this._classifyWhileLoop(header, body);
            return {
                type: whileRes.type,
                hasEarlyReturn,
                hasBreak,
                isUncertain: whileRes.isUncertain,
                assumption: whileRes.assumption,
            };
        }

        if (/\.(forEach|map|filter|reduce|flatMap)\s*\(/.test(header)) {
            return { type: 'linear', hasEarlyReturn, hasBreak, isUncertain: false };
        }

        if (/\bfor\s+[\w\s,()]+\s+in\b/.test(header) || /\bfor\s+[\w\s,()]+\s+of\b/.test(header)) {
            return { type: 'linear', hasEarlyReturn, hasBreak, isUncertain: false };
        }

        // Go for i < n {
        const goWhileMatch = header.match(/\bfor\s+([^;{]+)\s*\{?/);
        if (goWhileMatch) {
            const cond = goWhileMatch[1].trim();
            const whileRes = this._classifyWhileLoop('while ' + cond, body);
            return {
                type: whileRes.type,
                hasEarlyReturn,
                hasBreak,
                isUncertain: whileRes.isUncertain,
                assumption: whileRes.assumption,
            };
        }

        return { type: 'linear', hasEarlyReturn, hasBreak, isUncertain: false };
    }

    _classifyForLoop(cond, update, body, init = '') {
        // Constant condition check: e.g. i < 10, i <= 100, i > 0
        const isConstCond = /^[a-zA-Z_]\w*\s*(?:<|<=)\s*\d+$/.test(cond.trim()) ||
                            /^\d+\s*(?:>|>=)\s*[a-zA-Z_]\w*$/.test(cond.trim()) ||
                            /^[a-zA-Z_]\w*\s*(?:>|>=)\s*\d+$/.test(cond.trim());
        const isLinearUpdate = /\+\+|--|\+=\s*\d+|-=\s*\d+/.test(update);
        const isConstInit = !init || /\b\w+\s*=\s*\d+/.test(init) || /:=\s*\d+/.test(init);

        if (isConstCond && isLinearUpdate && isConstInit) {
            return 'constant';
        }

        // Doubling / exponential multiplication
        if (/\w+\s*\*=\s*\d+/.test(update) ||
            /\w+\s*<<=/.test(update) ||
            /\w+\s*=\s*\w+\s*\*\s*\d+/.test(update) ||
            /\w+\s*=\s*\d+\s*\*\s*\w+/.test(update) ||
            /\w+\s*=\s*\w+\s*<<\s*\d+/.test(update)) {
            return 'logarithmic';
        }

        // Halving / exponential division
        if (/\w+\s*\/=\s*\d+/.test(update) ||
            /\w+\s*>>=/.test(update) ||
            /\w+\s*=\s*\w+\s*\/\s*\d+/.test(update) ||
            /\w+\s*=\s*\w+\s*>>\s*\d+/.test(update)) {
            return 'logarithmic';
        }

        if (/(\w+)\s*=\s*\1\s*\*\s*\1/.test(update)) return 'loglog';
        if (/(\w+)\s*\*\s*\1\s*</.test(cond) || /sqrt/i.test(cond)) return 'sqrt';

        if (/(\w+)\s*\+=\s*(\w+)/.test(update)) {
            const m = update.match(/(\w+)\s*\+=\s*(\w+)/);
            if (m) {
                const [, loopVar, stepVar] = m;
                if (stepVar !== loopVar && !/^\d+$/.test(stepVar)) return 'harmonic';
            }
        }

        return 'linear';
    }

    _classifyWhileLoop(header, body) {
        if (this._isConstantEarlyExit(body)) {
            return { type: 'constant', isUncertain: false };
        }

        // Halving: i /= 2, i //= 2, i >>= 1, mid binary search updates
        const halvingPats = [
            /\b\w+\s*(?:\/=|>>=|\/\/=)\s*\d+/,
            /\b\w+\s*=\s*\w+\s*(?:\/|>>|\/\/)\s*\d+/,
            /\b\w+\s*=\s*(?:Math\.floor|Math\.trunc)\s*\(\s*\w+\s*\/\s*\d+\s*\)/,
            /(?:lo|left|low|start|l)\s*=\s*(?:m|mid|middle)\s*[+-]?\s*\d?\b/,
            /(?:hi|right|high|end|r)\s*=\s*(?:m|mid|middle)\s*[+-]?\s*\d?\b/,
            /(?:m|mid|middle)\s*=\s*[\w(]+\s*[+]\s*[\w)]+\s*(?:\/|\/\/)\s*2/,
            /(?:l|lo|left|low)\s*=\s*(?:m|mid|middle)\s*[+]\s*1/,
        ];
        if (halvingPats.some(p => p.test(body))) {
            return { type: 'logarithmic', isUncertain: false };
        }

        // Doubling: i *= 2, i <<= 1, i = i * 2
        const doublingPats = [
            /\b\w+\s*(?:\*=|<<=)\s*\d+/,
            /\b\w+\s*=\s*\w+\s*(?:\*|<<)\s*\d+/,
            /\b\w+\s*=\s*\d+\s*\*\s*\w+/,
        ];
        if (doublingPats.some(p => p.test(body))) {
            return { type: 'logarithmic', isUncertain: false };
        }

        if (/(\w+)\s*=\s*\1\s*\*\s*\1/.test(body)) {
            return { type: 'loglog', isUncertain: false };
        }

        if (/(\w+)\s*\*\s*\1\s*</.test(header) || /(\w+)\s*\*\s*\1\s*</.test(body) || /sqrt/i.test(header) || /sqrt/i.test(body)) {
            return { type: 'sqrt', isUncertain: false };
        }

        // Constant while loop: e.g. while i < 10: i += 1
        const constCondMatch = header.match(/\b\w+\s*(?:<|<=)\s*(\d+)/);
        const linearStepMatch = body.match(/\b\w+\s*(?:\+\+|--|\+=|-=)\s*(\d*)/);
        if (constCondMatch && linearStepMatch) {
            return { type: 'constant', isUncertain: false };
        }

        // Standard linear iteration counter
        const isLinearCounter = /\b\w+\s*(?:\+\+|--|\+=|-=)/.test(body);
        if (isLinearCounter) {
            return { type: 'linear', isUncertain: false };
        }

        // Opaque / uncertain while loop
        const isOpaque = /\w+\s*\(/.test(header) || /\bTrue\b|\btrue\b|\b1\b/.test(header) || !/[<>]/.test(header);
        if (isOpaque) {
            return {
                type: 'uncertain',
                isUncertain: true,
                assumption: `Loop iteration count could not be statically determined for "${header.trim()}". Assuming O(n) iterations.`,
            };
        }

        return { type: 'linear', isUncertain: false };
    }

    _isConstantEarlyExit(body) {
        if (!body || !body.trim()) return false;
        let s = body.trim();
        if (s.startsWith('{')) s = s.substring(1).trim();
        if (s.endsWith('}')) s = s.substring(0, s.length - 1).trim();
        if (!s) return false;

        const lines = s.split('\n').map(l => l.trim()).filter(l => l && l !== '{' && l !== '}');
        if (lines.length === 0) return false;

        const hasLoop = lines.some(l => /\b(for\s*\(|while\s*\(|for\s+\w+\s+in|while\s+.*:)\b/.test(l));
        if (hasLoop) return false;

        const first = lines[0];
        return /^(return|break)\b/.test(first);
    }

    _isTwoPointer(header, body) {
        if (!/\bfor\b/.test(header)) return false;
        const innerWhile = body.match(/\bwhile\s*\([^)]*\)/);
        if (!innerWhile) return false;
        const bodyAfterWhile = body.substring(body.indexOf(innerWhile[0]));
        const innerVar = innerWhile[0].match(/\b(\w+)\s*[<>]/);
        if (!innerVar) return false;
        const varName = innerVar[1];
        const resetPat = new RegExp(`\\b${varName}\\s*=\\s*(?:0|${varName}|\\bi\\b)`);
        if (resetPat.test(bodyAfterWhile)) return false;
        return true;
    }

    /* ==================================================================
       LOOP TREE COMPLEXITY CALCULATION
       ================================================================== */

    _loopTreeNodeComplexity(node, code) {
        const assumptions = [];
        if (node.assumption) {
            assumptions.push(node.assumption);
        }

        if (node.iterType === 'amortized-linear') {
            return {
                worst: { n: 1, logn: 0, label: 'O(n)' },
                best: node.hasEarlyReturn ? C1 : { n: 1, logn: 0, label: 'O(n)' },
                isUncertain: false,
                assumptions,
            };
        }

        const selfC = this._iterTypeToComplexity(node.iterType);
        const isUncertain = node.iterType === 'uncertain';

        if (node.children.length === 0) {
            let bestC;
            if (node.hasEarlyReturn || node.hasBreak) {
                bestC = C1;
            } else {
                bestC = selfC;
            }
            return {
                worst: selfC,
                best: bestC,
                isUncertain,
                assumptions,
            };
        }

        // Special combinations: linear outer + harmonic inner -> O(n log n)
        if (node.iterType === 'linear' &&
            node.children.length === 1 &&
            node.children[0].iterType === 'harmonic') {
            const combinedWorst = { n: 1, logn: 1, label: 'O(n log n)' };
            const combinedBest = node.hasEarlyReturn ? C1 : combinedWorst;
            return { worst: combinedWorst, best: combinedBest, isUncertain: false, assumptions };
        }

        // sqrt outer + harmonic inner -> O(n log log n)
        if (node.iterType === 'sqrt' &&
            node.children.length === 1 &&
            node.children[0].iterType === 'harmonic') {
            const combinedWorst = { loglogn: 1, n: 1, label: 'O(n log log n)' };
            const combinedBest = node.hasEarlyReturn ? C1 : combinedWorst;
            return { worst: combinedWorst, best: combinedBest, isUncertain: false, assumptions };
        }

        const childResults = node.children.map(c => this._loopTreeNodeComplexity(c, code));
        const maxChildWorst = childResults.map(r => r.worst).reduce((a, b) => this._maxC(a, b), C1);
        const maxChildBest = childResults.map(r => r.best).reduce((a, b) => this._maxC(a, b), C1);
        const anyChildUncertain = childResults.some(r => r.isUncertain);

        for (const cr of childResults) {
            if (cr.assumptions) assumptions.push(...cr.assumptions);
        }

        const worst = this._multiplyC(selfC, maxChildWorst);

        let best;
        if (node.hasEarlyReturn) {
            // Function returns immediately on the first iteration
            best = C1;
        } else if (node.hasBreak) {
            // Loop terminates after 1 iteration in best case
            best = this._multiplyC(C1, maxChildBest);
        } else {
            // Unconditional execution: all iterations must run
            best = this._multiplyC(selfC, maxChildBest);
        }

        return {
            worst,
            best,
            isUncertain: isUncertain || anyChildUncertain,
            assumptions,
        };
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
            case 'uncertain':        return { n: 1, logn: 0, label: 'O(n)' };
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
            hasSliceCopy: false,
            isUncertain: false,
            assumptions: [],
        };

        // Memoisation must be proven *inside* the recursive function (or by a
        // decorator directly above it). Scanning the whole file let any stray
        // `!= -1`, `visited`, `dp` or even a comment turn O(2^n) into O(n).
        const memoSignals = [
            /\b(?:memo|cache)\w*\s*[\[(]/i,
            /\bmemo(?:ize)?\s*\.\s*(?:get|set|has|count)\b/i,
            /\b(?:memo|cache)\w*\s*\.\s*(?:count|find|insert|put|get|has)\b/i,
            /@(?:functools\.)?(?:lru_)?cache\b/, /@memoize\b/,
            /\bdp\s*\[[^\]]+\]\s*=/,
        ];

        for (const fn of funcs) {
            const callRe = new RegExp(`\\b${fn.name}\\s*\\(`, 'g');
            const calls = (fn.body.match(callRe) || []);
            if (calls.length === 0) continue;

            result.isRecursive = true;
            result.functionName = fn.name;

            // Look only at this function's own body + its decorators.
            const decorators = code.slice(Math.max(0, fn.offset - 120), fn.offset);
            const hasMemo = memoSignals.some(p => p.test(fn.body)) ||
                            /@(?:functools\.)?(?:lru_)?cache\b|@memoize\b/.test(decorators);
            result.hasMemoization = hasMemo;

            const body = fn.body;
            const branchAnalysis = this._countBranches(body, fn.name);
            result.branchingFactor = branchAnalysis.branchingFactor;

            const halvesInput = /[\w()]+\s*(?:\/|\/\/)\s*2|[\w()]+\s*>>\s*1|\bmid\b|\.size\(\)\s*\/\s*2|len\s*\(\s*\w+\s*\)\s*(?:\/|\/\/)\s*2|\bpartition\b|\bpi\b|\bpivot\b/.test(body);
            const hasLoopWithRecCall = new RegExp(`(?:for|while)[\\s\\S]*?\\b${fn.name}\\s*\\(`).test(body);

            // Python list slice check: e.g. fn(items[1:]) or fn(arr[:mid])
            const hasSliceInCall = isPython && new RegExp(`\\b${fn.name}\\s*\\([^)]*\\[\\s*\\d*\\s*:\\s*[^)]*\\)`).test(body);

            if (hasLoopWithRecCall) {
                result.branchingFactor = 2;
                result.recursionType = 'branching';
            } else if (hasSliceInCall && !halvesInput && result.branchingFactor <= 1) {
                // Python recursive sum with slicing items[1:] -> O(n²) time, O(n²) space
                result.hasSliceCopy = true;
                result.recursionType = 'linear-slice-copy';
                result.branchingFactor = 1;
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
        const matches = body.match(re) || [];
        if (matches.length <= 1) {
            return { branchingFactor: matches.length, isMutuallyExclusive: true };
        }

        // Check if multiple calls appear in the same statement or expression
        const stmts = body.split(/[;{}\n]/).map(s => s.trim()).filter(Boolean);
        for (const s of stmts) {
            const lineMatches = s.match(new RegExp(`\\b${fnName}\\s*\\(`, 'g')) || [];
            if (lineMatches.length >= 2) {
                return { branchingFactor: lineMatches.length, isMutuallyExclusive: false };
            }
        }

        // Check if call is in a loop
        const inLoop = new RegExp(`(?:for|while)[\\s\\S]*?\\b${fnName}\\s*\\(`).test(body);
        if (inLoop) {
            return { branchingFactor: 2, isMutuallyExclusive: false };
        }

        // Check if all calls are guarded by return (mutually exclusive paths)
        const callStmts = stmts.filter(s => new RegExp(`\\b${fnName}\\s*\\(`).test(s));
        const allReturning = callStmts.every(s => /\breturn\b/.test(s));

        // If all calls return, check if they are in mutually exclusive branches
        if (allReturning) {
            return { branchingFactor: 1, isMutuallyExclusive: true };
        }

        // Sequential non-return calls (e.g. mergeSort(l, m); mergeSort(m+1, r);)
        return { branchingFactor: Math.min(callStmts.length, 2), isMutuallyExclusive: false };
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

    _analyzeLibraryCalls(code, loopInfo, isPython) {
        const result = { costs: [], maxLoopBodyCost: C1 };

        const lines = code.split('\n');
        let loopDepth = 0;
        for (const line of lines) {
            const t = line.trim();
            if (/\b(for\s*\(|while\s*\(|do\b)/.test(t) || /\bfor\s+\w+\s+in\b/.test(t) || /\.(forEach|map|filter|reduce)\s*\(/.test(t)) {
                loopDepth++;
            }

            if (loopDepth > 0) {
                // Vector erase / insert
                if (/\.erase\s*\(/.test(t) || /\.insert\s*\(\s*\w+\.begin\s*\(\)/.test(t)) {
                    result.costs.push({ op: 'vector.erase/insert', cost: 'O(n)', line: t });
                    result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 1 });
                }
                // String concatenation
                if ((/\w+\s*=\s*\w+\s*\+/.test(t) || /\w+\s*\+=/.test(t)) && /string|str\b/i.test(code)) {
                    result.costs.push({ op: 'string concat', cost: 'O(n)', line: t });
                    result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 1 });
                }
                // Python list slicing in loop: arr[i:] or items[1:]
                if (isPython && /\[\s*[^:\]]*:[^\]]*\]/.test(t)) {
                    result.costs.push({ op: 'list slicing (Python copy)', cost: 'O(n)', line: t });
                    result.maxLoopBodyCost = this._maxC(result.maxLoopBodyCost, { n: 1 });
                }
                // Map/set logarithmic ops
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
            /\.sort\s*\(/g, /\bsorted\s*\(/g, /\bArrays\.sort\b/g,
            /\bCollections\.sort\b/g, /\bstd::sort\b/g, /\bsort\s*\(/g,
            /\bstable_sort\s*\(/g,
        ];

        let hasSorting = false;
        let sortInsideLoop = false;
        const sortIndices = [];

        for (const p of sortPats) {
            let m;
            while ((m = p.exec(code)) !== null) {
                hasSorting = true;
                sortIndices.push(m.index);
            }
        }

        if (hasSorting && loopInfo && loopInfo.totalLoops > 0) {
            const allLoops = this._flattenLoopTree(this._buildLoopTree(code, false));
            for (const idx of sortIndices) {
                for (const l of allLoops) {
                    if (l.bodyStartIndex !== undefined && l.bodyEndIndex !== undefined) {
                        if (idx >= l.bodyStartIndex && idx < l.bodyEndIndex) {
                            sortInsideLoop = true;
                            break;
                        }
                    } else if (l.body) {
                        if (/\.sort\s*\(|\bsorted\s*\(|\bArrays\.sort\b|\bCollections\.sort\b|\bstd::sort\b|\bsort\s*\(|\bstable_sort\s*\(/.test(l.body)) {
                            sortInsideLoop = true;
                            break;
                        }
                    }
                }
                if (sortInsideLoop) break;
            }
        }

        return { hasSorting, sortInsideLoop };
    }

    /* ==================================================================
       DETERMINE TIME COMPLEXITY
       ================================================================== */

    _determineTime(loops, rec, ds, lib, sort, code, isPython) {
        let tc = C1;
        let best = C1;
        let worst = C1;
        let average = C1;
        let isUncertain = false;
        const assumptions = [];

        const nothingFound = loops.totalLoops === 0 && !rec.isRecursive && !sort.hasSorting;
        if (nothingFound) {
            return { notation: 'O(1)', bestCase: 'O(1)', worstCase: 'O(1)', averageCase: 'O(1)', isUncertain: false, assumptions: [] };
        }

        // O(V+E) only when the code actually looks like a graph traversal: a
        // queue/stack driven loop AND iteration over an adjacency list. Before,
        // the mere presence of "graph" + a queue forced O(V+E) on nested loops.
        if (ds.usesGraph && (ds.usesQueue || ds.usesStack)) {
            const hasTraversalLoop =
                /while\s*\(\s*!?\s*\w+\s*\.\s*(?:empty|isEmpty)\s*\(\s*\)\s*\)/.test(code) ||
                /while\s+\w+\s*:/.test(code) ||
                /while\s*\(\s*\w+\s*\.\s*size\s*\(\s*\)\s*>\s*0\s*\)/.test(code);
            const hasAdjacencyIteration =
                /\b(?:for|while)\s*\([^)]*\b(?:graph|adj|g)\s*\[/.test(code) ||
                /\bfor\s+\w+\s+in\s+(?:graph|adj)\w*\s*\[/.test(code) ||
                /\bneighbo(?:u)?rs?\b/.test(code) ||
                /\bfor\s+\w+\s+in\s+\w+\s*\.\s*(?:neighbors|adj)\b/.test(code);

            if (hasTraversalLoop && hasAdjacencyIteration) {
                return {
                    notation: 'O(V + E)',
                    bestCase: 'O(1)',
                    worstCase: 'O(V + E)',
                    averageCase: 'O(V + E)',
                    isUncertain: false,
                    assumptions: [],
                };
            }
        }

        // Recursion Handling
        if (rec.isRecursive) {
            const rt = rec.recursionType;
            const b  = rec.branchingFactor;

            if (rt === 'linear-slice-copy') {
                // In Python, slicing a list in linear recursion: O(n²) time
                tc = worst = average = { n: 2, logn: 0, label: 'O(n²)' };
                best = C1;
            } else if (rt === 'branching') {
                tc = worst = average = { n: 0, exp: b, label: `O(${b}^n)` };
                best = C1;
            } else if (rt === 'memoized-branching') {
                tc = worst = average = { n: 1, logn: 0, label: 'O(n)' };
                best = C1;
            } else if (rt === 'divide-and-conquer') {
                if (b >= 2) {
                    // Merge sort unconditionally splits and merges all elements
                    tc = best = worst = average = { n: 1, logn: 1, label: 'O(n log n)' };
                } else {
                    // Binary search makes 1 recursive call per step: O(log n), best O(1)
                    tc = worst = average = { n: 0, logn: 1, label: 'O(log n)' };
                    best = C1;
                }
            } else {
                tc = worst = average = { n: 1, logn: 0, label: 'O(n)' };
                best = C1;
            }
        }

        // Loops Handling
        if (loops.totalLoops > 0) {
            const lcWorst = this._multiplyC(loops.combinedWorst || C1, lib.maxLoopBodyCost);
            const lcBest  = loops.combinedBest || C1;
            const lcAvg   = lcWorst;

            if (loops.isUncertain) {
                isUncertain = true;
                if (loops.assumptions) assumptions.push(...loops.assumptions);
            }

            if (rec.isRecursive && rec.recursionType === 'divide-and-conquer' && rec.branchingFactor >= 2) {
                // Divide-and-conquer sorting dominates loop merge steps
                tc = best = worst = average = { n: 1, logn: 1, label: 'O(n log n)' };
            } else if (!rec.isRecursive) {
                tc      = lcWorst;
                worst   = lcWorst;
                best    = lcBest;
                average = lcAvg;
            } else {
                tc      = this._maxC(tc, lcWorst);
                worst   = this._maxC(worst, lcWorst);
                best    = this._maxC(best, lcBest);
                average = this._maxC(average, lcAvg);
            }
        }

        // Sorting Handling
        if (sort.hasSorting) {
            if (sort.sortInsideLoop) {
                const sortInLoop = this._multiplyC(
                    loops.combinedComplexity || { n: 1 },
                    { n: 1, logn: 1 }
                );
                tc      = this._maxC(tc, sortInLoop);
                worst   = this._maxC(worst, sortInLoop);
                average = this._maxC(average, sortInLoop);
            } else {
                const nlogn = { n: 1, logn: 1, label: 'O(n log n)' };
                tc      = this._maxC(tc, nlogn);
                worst   = this._maxC(worst, nlogn);
                average = this._maxC(average, nlogn);
                best    = this._maxC(best, { n: 1, logn: 0 });
            }
        }

        return {
            notation:    this._cToString(tc),
            bestCase:    this._cToString(best),
            worstCase:   this._cToString(worst),
            averageCase: this._cToString(average),
            isUncertain,
            assumptions,
        };
    }

    /* ==================================================================
       DETERMINE SPACE COMPLEXITY
       ================================================================== */

    _determineSpace(code, loops, rec, ds, isPython) {
        let sp = C1;
        let isUncertain = false;
        const assumptions = [];

        // Linear array/vector allocations
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

        if (ds.usesHashMap || ds.usesSet || ds.usesOrderedMap || ds.usesOrderedSet || ds.usesHeap || ds.usesQueue || ds.usesStack) {
            sp = this._maxC(sp, { n: 1 });
        }

        // Generic container creation — previously only the literal word "dict"
        // counted, so `seen = {}` was reported as O(1) auxiliary space.
        const containerAlloc = [
            /=\s*\{\s*\}/,
            /=\s*(?:set|dict|list)\s*\(\s*\)/,
            /=\s*\[\s*\]/,
            /=\s*new\s+(?:Map|Set|Array|ArrayList|HashMap|HashSet|LinkedList|Deque|Stack|Queue)\b/,
            /:=\s*make\s*\(\s*(?:map|\[\])/,
            /=\s*(?:HashMap|HashSet|Vec)::new\s*\(\s*\)/,
            /\.(?:append|push|push_back|add|put|insert)\s*\(/,
        ];
        if (containerAlloc.some(p => p.test(code))) {
            sp = this._maxC(sp, { n: 1 });
        }

        if (ds.usesGraph) {
            sp = this._maxC(sp, { n: 1 });
        }

        // 2D Matrix Allocations
        const twoDAlloc = [
            /vector\s*<\s*vector\s*<[^>]+>\s*>\s*\w+\s*\(/,
            /\bdp\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]\s*=/,
            /new\s+\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/,
            /\[\s*\[\s*0\s*\]\s*\*\s*\w+\s*for\s/,
        ];
        if (twoDAlloc.some(p => p.test(code))) {
            sp = this._maxC(sp, { n: 2 });
        }

        // Recursion Space
        if (rec.isRecursive) {
            if (rec.recursionType === 'linear-slice-copy') {
                // In Python, list slicing creates a new list copy at each call stack frame: O(n²) space
                sp = this._maxC(sp, { n: 2, logn: 0, label: 'O(n²)' });
            } else if (rec.recursionType === 'divide-and-conquer') {
                if (rec.branchingFactor >= 2) {
                    // Merge sort uses O(n) auxiliary space for temporary lists/buffers
                    sp = this._maxC(sp, { n: 1, logn: 0, label: 'O(n)' });
                } else {
                    // Binary search uses O(log n) call stack frames
                    sp = this._maxC(sp, { n: 0, logn: 1, label: 'O(log n)' });
                }
            } else if (rec.recursionType === 'memoized-branching') {
                sp = this._maxC(sp, { n: 1 });
            } else if (rec.recursionType === 'branching') {
                sp = this._maxC(sp, { n: 1 });
            } else {
                sp = this._maxC(sp, { n: 1 });
            }
        }

        // String append in loops
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

        return { notation: this._cToString(sp), isUncertain, assumptions };
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

    _buildExplanation(loops, rec, ds, lib, sort, tc, space) {
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
                    'constant':         'constant iterations (e.g., fixed range/bound) — O(1) each',
                    'linear':           'iterates linearly with input size — O(n) each',
                    'logarithmic':      'doubles or halves counter/search space — O(log n) each',
                    'loglog':           'squares the iterator — O(log log n) each',
                    'sqrt':             'runs up to √n iterations each',
                    'harmonic':         'harmonic step (j += i) — combined with outer gives O(n log n)',
                    'amortized-linear': 'two-pointer / amortized — O(n) total across all outer iterations',
                    'uncertain':        'termination condition cannot be proven statically — estimated as O(n)',
                }[t] || `${t}`;
                points.push(`${count} loop(s): ${desc}.`);
            }

            const earlyReturns = loops.loopTypes.filter(l => l.hasEarlyReturn).length;
            if (earlyReturns > 0) {
                points.push(`Early exit / return condition detected inside loop — best-case time is O(1) when target is found immediately.`);
            } else if (loops.maxNestingDepth > 1 && !loops.loopTypes.some(l => l.hasEarlyReturn)) {
                points.push(`Nested loops execute unconditionally without early return — best-case time matches worst-case ${tc.bestCase}.`);
            } else if (loops.totalLoops > 0 && !loops.loopTypes.some(l => l.hasEarlyReturn)) {
                points.push(`Loop executes unconditionally without early return — best-case time matches worst-case ${tc.bestCase}.`);
            }
        }

        if (lib.costs.length > 0) {
            for (const c of lib.costs) {
                points.push(`Hidden cost: ${c.op} is ${c.cost} per call inside a loop.`);
            }
        }

        if (rec.isRecursive) {
            points.push(`Recursive function "${rec.functionName}" detected.`);
            if (rec.recursionType === 'linear-slice-copy') {
                points.push('In Python, list slicing (e.g. items[1:]) creates an O(n) copy at each call. Across n recursive calls, this increases total time complexity to O(n²) and auxiliary space to O(n²).');
            } else if (rec.recursionType === 'branching') {
                points.push(`Branches into ${rec.branchingFactor} concurrent recursive calls → exponential O(${rec.branchingFactor}^n).`);
            } else if (rec.recursionType === 'memoized-branching') {
                points.push('Memoization detected — exponential branching reduced to O(n).');
            } else if (rec.recursionType === 'divide-and-conquer') {
                if (rec.branchingFactor >= 2) {
                    points.push(`Divide-and-conquer: 2 recursive branches halving input with linear merge step → O(n log n) time.`);
                    points.push(`Auxiliary space: Merge sort requires O(n) temporary space for merged subarrays in addition to O(log n) stack frames.`);
                } else {
                    points.push('Divide-and-conquer: Mutually exclusive branch halving search space (e.g., binary search) → O(log n) time, O(1) best case, O(log n) stack space.');
                }
            } else {
                points.push('Linear recursion — each call reduces the problem size by a constant amount.');
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
}

const C1 = Object.freeze({ n: 0, logn: 0, label: 'O(1)' });

if (typeof window !== 'undefined') window.ComplexityAnalyzer = ComplexityAnalyzer;
if (typeof module !== 'undefined') module.exports = ComplexityAnalyzer;
