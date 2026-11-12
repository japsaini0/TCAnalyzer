/**
 * Comprehensive Regression Test Suite for TC Analyzer
 * Tests all findings across supported languages (Python, JavaScript, Java, C++, Go).
 */

const ComplexityAnalyzer = require('./analyzer.js');
const analyzer = new ComplexityAnalyzer();

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

function assertTest(name, result, expected) {
    totalTests++;
    const errors = [];

    if (expected.time !== undefined && result.timeComplexity !== expected.time) {
        errors.push(`time: expected ${expected.time}, got ${result.timeComplexity}`);
    }
    if (expected.space !== undefined && result.spaceComplexity !== expected.space) {
        errors.push(`space: expected ${expected.space}, got ${result.spaceComplexity}`);
    }
    if (expected.best !== undefined && result.bestCase !== expected.best) {
        errors.push(`bestCase: expected ${expected.best}, got ${result.bestCase}`);
    }
    if (expected.worst !== undefined && result.worstCase !== expected.worst) {
        errors.push(`worstCase: expected ${expected.worst}, got ${result.worstCase}`);
    }
    if (expected.average !== undefined && result.averageCase !== expected.average) {
        errors.push(`averageCase: expected ${expected.average}, got ${result.averageCase}`);
    }
    if (expected.isUncertain !== undefined && result.isUncertain !== expected.isUncertain) {
        errors.push(`isUncertain: expected ${expected.isUncertain}, got ${result.isUncertain}`);
    }
    if (expected.hasAssumptions && (!result.assumptions || result.assumptions.length === 0)) {
        errors.push(`expected assumptions to be present, but got empty`);
    }

    if (errors.length === 0) {
        passedTests++;
        console.log(`  ✓ ${name}`);
    } else {
        failedTests.push({ name, errors });
        console.error(`  ✗ ${name}`);
        errors.forEach(e => console.error(`      - ${e}`));
    }
}

console.log('==================================================');
console.log('Running TC Analyzer Regression Tests');
console.log('==================================================\n');

// ==========================================
// 1. Loop Growth Rates (O(1), O(log n), O(n))
// ==========================================
console.log('--- Group 1: Loop Growth Rates ---');

// Python constant range
assertTest('Python range(10) is O(1)',
    analyzer.analyze('for i in range(10):\n    pass', 'python'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)', space: 'O(1)' }
);

assertTest('Python range(0, 10, 2) is O(1)',
    analyzer.analyze('for i in range(0, 10, 2):\n    pass', 'python'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// Python doubling while loop: O(log n)
assertTest('Python doubling counter while loop is O(log n)',
    analyzer.analyze('i = 1\nwhile i < n:\n    i *= 2', 'python'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// Python halving while loop: O(log n)
assertTest('Python halving counter while loop is O(log n)',
    analyzer.analyze('while n > 1:\n    n //= 2', 'python'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// JavaScript constant for loop: O(1)
assertTest('JavaScript constant for loop is O(1)',
    analyzer.analyze('function f() { for (let i = 0; i < 10; i++) { sum += i; } }', 'javascript'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// JavaScript doubling for loop: O(log n)
assertTest('JavaScript doubling for loop is O(log n)',
    analyzer.analyze('function f(n) { for (let i = 1; i < n; i *= 2) { count++; } }', 'javascript'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// JavaScript halving while loop: O(log n)
assertTest('JavaScript halving while loop is O(log n)',
    analyzer.analyze('function f(n) { let i = n; while (i > 1) { i = Math.floor(i / 2); } }', 'javascript'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// Java constant for loop: O(1)
assertTest('Java constant for loop is O(1)',
    analyzer.analyze('public void test() { for (int i = 0; i < 50; i++) { System.out.println(i); } }', 'java'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// Java doubling while loop: O(log n)
assertTest('Java doubling while loop is O(log n)',
    analyzer.analyze('public void test(int n) { int i = 1; while (i < n) { i *= 2; } }', 'java'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// Java halving for loop: O(log n)
assertTest('Java halving for loop is O(log n)',
    analyzer.analyze('public void test(int n) { for (int i = n; i > 0; i /= 2) { count++; } }', 'java'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// C++ constant for loop: O(1)
assertTest('C++ constant for loop is O(1)',
    analyzer.analyze('void f() { for (int i = 0; i < 100; ++i) { sum += i; } }', 'cpp'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// C++ doubling bitshift for loop: O(log n)
assertTest('C++ doubling bitshift loop is O(log n)',
    analyzer.analyze('void f(int n) { for (int i = 1; i < n; i <<= 1) { sum += i; } }', 'cpp'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// C++ halving while loop: O(log n)
assertTest('C++ halving while loop is O(log n)',
    analyzer.analyze('void f(int n) { int i = n; while (i > 0) { i /= 2; } }', 'cpp'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// Go constant for loop: O(1)
assertTest('Go constant for loop is O(1)',
    analyzer.analyze('func f() {\n    for i := 0; i < 10; i++ {\n        sum += i\n    }\n}', 'go'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// Go doubling for loop: O(log n)
assertTest('Go doubling for loop is O(log n)',
    analyzer.analyze('func f(n int) {\n    for i := 1; i < n; i *= 2 {\n        sum += i\n    }\n}', 'go'),
    { time: 'O(log n)', best: 'O(log n)', worst: 'O(log n)' }
);

// ==========================================
// 2. Nested Loop Combinations
// ==========================================
console.log('\n--- Group 2: Nested Loop Combinations ---');

// Python outer n, inner doubling -> O(n log n)
assertTest('Python outer O(n), inner doubling O(log n) -> O(n log n)',
    analyzer.analyze('def test(n):\n    for i in range(n):\n        j = 1\n        while j < n:\n            j *= 2', 'python'),
    { time: 'O(n log n)', best: 'O(n log n)', worst: 'O(n log n)' }
);

// Python outer n, inner constant -> O(n)
assertTest('Python outer O(n), inner range(10) O(1) -> O(n)',
    analyzer.analyze('def test(n):\n    for i in range(n):\n        for j in range(10):\n            pass', 'python'),
    { time: 'O(n)', best: 'O(n)', worst: 'O(n)' }
);

// Python outer constant range(5), inner linear range(n) -> O(n)
assertTest('Python outer range(5) O(1), inner range(n) O(n) -> O(n)',
    analyzer.analyze('def test(n):\n    for i in range(5):\n        for j in range(n):\n            pass', 'python'),
    { time: 'O(n)', best: 'O(n)', worst: 'O(n)' }
);

// Python outer constant, inner constant -> O(1)
assertTest('Python outer range(5), inner range(10) -> O(1)',
    analyzer.analyze('def test():\n    for i in range(5):\n        for j in range(10):\n            pass', 'python'),
    { time: 'O(1)', best: 'O(1)', worst: 'O(1)' }
);

// JavaScript outer linear, inner doubling -> O(n log n)
assertTest('JavaScript outer linear, inner doubling -> O(n log n)',
    analyzer.analyze('function f(n) {\n    for (let i = 0; i < n; i++) {\n        for (let j = 1; j < n; j *= 2) {\n            count++;\n        }\n    }\n}', 'javascript'),
    { time: 'O(n log n)', best: 'O(n log n)', worst: 'O(n log n)' }
);

// JavaScript outer linear, inner constant -> O(n)
assertTest('JavaScript outer linear, inner constant -> O(n)',
    analyzer.analyze('function f(n) {\n    for (let i = 0; i < n; i++) {\n        for (let j = 0; j < 10; j++) {\n            count++;\n        }\n    }\n}', 'javascript'),
    { time: 'O(n)', best: 'O(n)', worst: 'O(n)' }
);

// Java outer linear, inner doubling -> O(n log n)
assertTest('Java outer linear, inner doubling -> O(n log n)',
    analyzer.analyze('public void f(int n) {\n    for (int i = 0; i < n; i++) {\n        for (int j = 1; j < n; j *= 2) {\n            sum++;\n        }\n    }\n}', 'java'),
    { time: 'O(n log n)', best: 'O(n log n)', worst: 'O(n log n)' }
);

// C++ outer linear, inner doubling -> O(n log n)
assertTest('C++ outer linear, inner doubling -> O(n log n)',
    analyzer.analyze('void f(int n) {\n    for (int i = 0; i < n; i++) {\n        for (int j = 1; j < n; j *= 2) {\n            sum++;\n        }\n    }\n}', 'cpp'),
    { time: 'O(n log n)', best: 'O(n log n)', worst: 'O(n log n)' }
);

// C++ outer linear, inner constant -> O(n)
assertTest('C++ outer linear, inner constant -> O(n)',
    analyzer.analyze('void f(int n) {\n    for (int i = 0; i < n; i++) {\n        for (int j = 0; j < 10; j++) {\n            sum++;\n        }\n    }\n}', 'cpp'),
    { time: 'O(n)', best: 'O(n)', worst: 'O(n)' }
);

// ==========================================
// 3. Recursive Control Flow (Binary Search)
// ==========================================
console.log('\n--- Group 3: Recursive Control Flow ---');

const pyBinarySearch = `
def binary_search(arr, low, high, x):
    if high >= low:
        mid = (high + low) // 2
        if arr[mid] == x:
            return mid
        elif arr[mid] > x:
            return binary_search(arr, low, mid - 1, x)
        else:
            return binary_search(arr, mid + 1, high, x)
    return -1
`;
assertTest('Python recursive binary search is O(log n) time, best O(1), space O(log n)',
    analyzer.analyze(pyBinarySearch, 'python'),
    { time: 'O(log n)', best: 'O(1)', worst: 'O(log n)', space: 'O(log n)' }
);

const cppBinarySearch = `
int binarySearch(vector<int>& arr, int l, int r, int x) {
    if (r >= l) {
        int mid = l + (r - l) / 2;
        if (arr[mid] == x)
            return mid;
        if (arr[mid] > x)
            return binarySearch(arr, l, mid - 1, x);
        return binarySearch(arr, mid + 1, r, x);
    }
    return -1;
}
`;
assertTest('C++ recursive binary search is O(log n) time, best O(1), space O(log n)',
    analyzer.analyze(cppBinarySearch, 'cpp'),
    { time: 'O(log n)', best: 'O(1)', worst: 'O(log n)', space: 'O(log n)' }
);

const javaBinarySearch = `
public int binarySearch(int[] arr, int l, int r, int x) {
    if (r >= l) {
        int mid = l + (r - l) / 2;
        if (arr[mid] == x)
            return mid;
        if (arr[mid] > x)
            return binarySearch(arr, l, mid - 1, x);
        else
            return binarySearch(arr, mid + 1, r, x);
    }
    return -1;
}
`;
assertTest('Java recursive binary search is O(log n) time, best O(1)',
    analyzer.analyze(javaBinarySearch, 'java'),
    { time: 'O(log n)', best: 'O(1)', worst: 'O(log n)', space: 'O(log n)' }
);

const jsBinarySearch = `
function binarySearch(arr, l, r, x) {
    if (r >= l) {
        const mid = Math.floor((l + r) / 2);
        if (arr[mid] === x) return mid;
        if (arr[mid] > x) return binarySearch(arr, l, mid - 1, x);
        return binarySearch(arr, mid + 1, r, x);
    }
    return -1;
}
`;
assertTest('JavaScript recursive binary search is O(log n) time, best O(1)',
    analyzer.analyze(jsBinarySearch, 'javascript'),
    { time: 'O(log n)', best: 'O(1)', worst: 'O(log n)', space: 'O(log n)' }
);

// ==========================================
// 4. Language-Specific Costs (Python Slicing)
// ==========================================
console.log('\n--- Group 4: Language-Specific Costs (Python Slicing) ---');

const pyRecSumSlice = `
def rec_sum(items):
    if not items:
        return 0
    return items[0] + rec_sum(items[1:])
`;
assertTest('Python recursive sum with list slice is O(n²) time and O(n²) space',
    analyzer.analyze(pyRecSumSlice, 'python'),
    { time: 'O(n²)', space: 'O(n²)', worst: 'O(n²)' }
);

const pySliceInLoop = `
def slice_loop(arr):
    res = []
    for i in range(len(arr)):
        res.append(arr[i:])
    return res
`;
assertTest('Python list slicing inside linear loop is O(n²) time',
    analyzer.analyze(pySliceInLoop, 'python'),
    { time: 'O(n²)' }
);

// ==========================================
// 5. Space Estimates for Merge Sort
// ==========================================
console.log('\n--- Group 5: Space Estimates for Merge Sort ---');

const pyMergeSort = `
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)
`;
assertTest('Python merge sort uses O(n) auxiliary space',
    analyzer.analyze(pyMergeSort, 'python'),
    { time: 'O(n log n)', space: 'O(n)' }
);

const cppMergeSort = `
void merge(vector<int>& arr, int l, int m, int r) {
    vector<int> left(arr.begin() + l, arr.begin() + m + 1);
    vector<int> right(arr.begin() + m + 1, arr.begin() + r + 1);
}
void mergeSort(vector<int>& arr, int l, int r) {
    if (l >= r) return;
    int m = l + (r - l) / 2;
    mergeSort(arr, l, m);
    mergeSort(arr, m + 1, r);
    merge(arr, l, m, r);
}
`;
assertTest('C++ merge sort uses O(n) auxiliary space',
    analyzer.analyze(cppMergeSort, 'cpp'),
    { time: 'O(n log n)', space: 'O(n)' }
);

const javaMergeSort = `
public void mergeSort(int[] arr, int l, int r) {
    if (l >= r) return;
    int m = l + (r - l) / 2;
    mergeSort(arr, l, m);
    mergeSort(arr, m + 1, r);
    merge(arr, l, m, r);
}
`;
assertTest('Java merge sort uses O(n) auxiliary space',
    analyzer.analyze(javaMergeSort, 'java'),
    { time: 'O(n log n)', space: 'O(n)' }
);

// ==========================================
// 6. Best, Average, Worst Case from Control Flow
// ==========================================
console.log('\n--- Group 6: Best, Average, Worst Cases ---');

// Unconditional single loop
assertTest('Unconditional loop has O(n) best-case time',
    analyzer.analyze('def total(arr):\n    s = 0\n    for x in arr:\n        s += x\n    return s', 'python'),
    { time: 'O(n)', best: 'O(n)', worst: 'O(n)', average: 'O(n)' }
);

// Two unconditional nested loops
assertTest('Two unconditional nested loops have O(n²) best-case time',
    analyzer.analyze('def matrix_sum(arr):\n    s = 0\n    for x in arr:\n        for y in arr:\n            s += y\n    return s', 'python'),
    { time: 'O(n²)', best: 'O(n²)', worst: 'O(n²)', average: 'O(n²)' }
);

assertTest('C++ two unconditional nested loops have O(n²) best-case time',
    analyzer.analyze('int f(int n) {\n    int sum = 0;\n    for (int i = 0; i < n; i++) {\n        for (int j = 0; j < n; j++) {\n            sum += 1;\n        }\n    }\n    return sum;\n}', 'cpp'),
    { time: 'O(n²)', best: 'O(n²)', worst: 'O(n²)', average: 'O(n²)' }
);

// Linear search with early return
assertTest('Linear search with early return has best O(1), avg O(n), worst O(n)',
    analyzer.analyze('def search(arr, target):\n    for i in range(len(arr)):\n        if arr[i] == target:\n            return i\n    return -1', 'python'),
    { time: 'O(n)', best: 'O(1)', worst: 'O(n)', average: 'O(n)' }
);

assertTest('C++ linear search with early return has best O(1), worst O(n)',
    analyzer.analyze('int search(vector<int>& arr, int target) {\n    for (int i = 0; i < arr.size(); i++) {\n        if (arr[i] == target) return i;\n    }\n    return -1;\n}', 'cpp'),
    { time: 'O(n)', best: 'O(1)', worst: 'O(n)', average: 'O(n)' }
);

// ==========================================
// 7. Preserved Working Patterns
// ==========================================
console.log('\n--- Group 7: Preserved Working Patterns ---');

// Naive Fibonacci
assertTest('Naive Fibonacci is O(2^n)',
    analyzer.analyze('int fib(int n) { if (n <= 1) return n; return fib(n - 1) + fib(n - 2); }', 'cpp'),
    { time: 'O(2^n)', worst: 'O(2^n)' }
);

// Memoized Fibonacci
assertTest('Memoized Fibonacci is O(n) time, O(n) space',
    analyzer.analyze('unordered_map<int, int> memo;\nint fib(int n) {\n    if (memo.count(n)) return memo[n];\n    if (n <= 1) return n;\n    return memo[n] = fib(n - 1) + fib(n - 2);\n}', 'cpp'),
    { time: 'O(n)', space: 'O(n)' }
);

// Two Sum (Hash Map)
assertTest('Two Sum with hash map is O(n)',
    analyzer.analyze('vector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int, int> seen;\n    for (int i = 0; i < nums.size(); i++) {\n        int comp = target - nums[i];\n        if (seen.count(comp)) return {seen[comp], i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}', 'cpp'),
    { time: 'O(n)', best: 'O(1)', worst: 'O(n)', space: 'O(n)' }
);

// BFS Graph Traversal
assertTest('BFS graph traversal is O(V + E)',
    analyzer.analyze('void bfs(vector<vector<int>>& graph, int start) {\n    unordered_set<int> visited;\n    queue<int> q;\n    q.push(start);\n    visited.insert(start);\n    while (!q.empty()) {\n        int node = q.front(); q.pop();\n        for (int neighbor : graph[node]) {\n            if (!visited.count(neighbor)) {\n                visited.insert(neighbor);\n                q.push(neighbor);\n            }\n        }\n    }\n}', 'cpp'),
    { time: 'O(V + E)', worst: 'O(V + E)' }
);

// ==========================================
// 8. Uncertainty & Assumptions
// ==========================================
console.log('\n--- Group 8: Uncertainty & Assumptions ---');

// Opaque while loop condition
assertTest('Opaque while condition flags uncertainty and records assumptions',
    analyzer.analyze('def worker():\n    while has_more_data():\n        process_item()', 'python'),
    { isUncertain: true, hasAssumptions: true }
);

console.log('\n==================================================');
console.log(`Results: ${passedTests} / ${totalTests} passed`);
console.log('==================================================');

if (failedTests.length > 0) {
    console.error(`\n${failedTests.length} tests failed!`);
    process.exit(1);
} else {
    console.log('\nAll regression tests passed successfully!');
}
