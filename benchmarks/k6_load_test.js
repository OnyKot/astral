// k6 load test script for comparing C++ userver vs Node.js
// Usage: k6 run benchmarks/k6_load_test.js

import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6';

// Configuration
const CPP_URL = __ENV.CPP_URL || 'http://localhost:8085/invites/test123';
const NODE_URL = __ENV.NODE_URL || 'http://localhost:8082/invites/test123';
const ITERATIONS = parseInt(__ENV.ITERATIONS || '1000');

// Custom metrics
const cppLatency = new Trend('cpp_latency_ms');
const nodeLatency = new Trend('node_latency_ms');
const cppErrors = new Counter('cpp_errors');
const nodeErrors = new Counter('node_errors');
const cacheHits = new Counter('cache_hits');

// Test scenarios
export const options = {
    scenarios: {
        cpp_benchmark: {
            executor: 'constant-vus',
            vus: 10,
            duration: '30s',
            exec: 'testCpp'
        },
        node_benchmark: {
            executor: 'constant-vus',
            vus: 10,
            duration: '30s',
            exec: 'testNode'
        }
    },
    thresholds: {
        'cpp_latency_ms': ['p(99)<50'],  // C++ should be under 50ms at p99
        'node_latency_ms': ['p(99)<200'], // Node can be up to 200ms at p99
    }
};

// C++ userver benchmark
export function testCpp() {
    const start = Date.now();
    const res = http.get(CPP_URL);
    const latency = Date.now() - start;

    cppLatency.add(latency);

    if (res.status !== 200) {
        cppErrors.add(1);
        return;
    }

    // Check for cache hit header
    if (res.headers['X-Astral-Invite-Fast-Path'] === 'hit' ||
        res.headers['X-Astral-DB-Path'] === 'scylla') {
        cacheHits.add(1);
    }
}

// Node.js benchmark
export function testNode() {
    const start = Date.now();
    const res = http.get(NODE_URL);
    const latency = Date.now() - start;

    nodeLatency.add(latency);

    if (res.status !== 200) {
        nodeErrors.add(1);
    }
}

// Summary (runs after test completion)
export function handleSummary(data) {
    return {
        'stdout': textSummary(data),
        'benchmark_results.json': JSON.stringify(data, null, 2),
    };
}

function textSummary(data) {
    const cpp = data.metrics.cpp_latency_ms;
    const node = data.metrics.node_latency_ms;

    const cpp_p50 = cpp.values['50.0'];
    const cpp_p99 = cpp.values['99.0'];
    const node_p50 = node.values['50.0'];
    const node_p99 = node.values['99.0'];

    const improvement_p50 = node_p50 > 0 ? ((node_p50 / cpp_p50 - 1) * 100).toFixed(1) : 'N/A';
    const improvement_p99 = node_p99 > 0 ? ((node_p99 / cpp_p99 - 1) * 100).toFixed(1) : 'N/A';

    return `
╔══════════════════════════════════════════════════════════════════╗
║                    BENCHMARK RESULTS                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Metric              │  C++ (userver)  │  Node.js    │ Change   ║
╠══════════════════════════════════════════════════════════════════╣
║  p50 latency (ms)    │  ${String(cpp_p50 || 0).padStart(12)}  │  ${String(node_p50 || 0).padStart(10)} │ ${improvement_p50.padStart(9)}%  ║
║  p99 latency (ms)    │  ${String(cpp_p99 || 0).padStart(12)}  │  ${String(node_p99 || 0).padStart(10)} │ ${improvement_p99.padStart(9)}%  ║
║  Errors              │  ${String(data.metrics.cpp_errors.values).padStart(12)}  │  ${String(data.metrics.node_errors.values).padStart(10)} │          ║
╚══════════════════════════════════════════════════════════════════╝
    `;
}