#!/usr/bin/env python3
"""
Astral SDK — Comparative Benchmark
Compares C++ userver service vs Node.js API latency

Usage:
    python benchmarks/compare.py --iterations 1000

Output:
    - Latency percentiles (p50, p90, p99, p99.9)
    - Throughput (req/s)
    - Comparison table
"""

import argparse
import asyncio
import statistics
import time
import aiohttp
import json
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

try:
    from tabulate import tabulate
    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False


class Backend(Enum):
    CPP = "C++ (userver)"
    NODE = "Node.js"


@dataclass
class BenchmarkResult:
    backend: Backend
    endpoint: str
    iterations: int
    latencies_ms: List[float] = field(default_factory=list)
    errors: int = 0
    total_time_ms: float = 0.0

    @property
    def p50(self) -> float:
        if not self.latencies_ms: return 0
        return statistics.quantiles(self.latencies_ms, n=100)[49]

    @property
    def p90(self) -> float:
        if not self.latencies_ms: return 0
        return statistics.quantiles(self.latencies_ms, n=100)[89]

    @property
    def p99(self) -> float:
        if not self.latencies_ms: return 0
        return statistics.quantiles(self.latencies_ms, n=100)[98]

    @property
    def p999(self) -> float:
        if not self.latencies_ms: return 0
        return statistics.quantiles(self.latencies_ms, n=1000)[998]

    @property
    def avg(self) -> float:
        if not self.latencies_ms: return 0
        return statistics.mean(self.latencies_ms)

    @property
    def stddev(self) -> float:
        if len(self.latencies_ms) < 2: return 0
        return statistics.stdev(self.latencies_ms)

    @property
    def rps(self) -> float:
        return (self.iterations / self.total_time_ms) * 1000 if self.total_time_ms > 0 else 0


async def make_request(session: aiohttp.ClientSession, url: str) -> tuple[float, bool]:
    """Make a single request and return (latency_ms, success)"""
    start = time.perf_counter()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            await resp.read()
            latency = (time.perf_counter() - start) * 1000
            return latency, resp.status < 400
    except Exception:
        latency = (time.perf_counter() - start) * 1000
        return latency, False


async def run_benchmark(
    name: str,
    url: str,
    iterations: int,
    concurrency: int = 10
) -> BenchmarkResult:
    """Run benchmark against a single endpoint"""
    result = BenchmarkResult(
        backend=Backend.CPP if "userver" in url else Backend.NODE,
        endpoint=name,
        iterations=iterations
    )

    print(f"\n{'='*60}")
    print(f"Benchmarking: {name}")
    print(f"URL: {url}")
    print(f"Iterations: {iterations}, Concurrency: {concurrency}")
    print(f"{'='*60}")

    connector = aiohttp.TCPConnector(limit=concurrency)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        start_time = time.perf_counter()

        for i in range(iterations):
            tasks.append(make_request(session, url))

            # Batch requests for concurrency
            if len(tasks) >= concurrency:
                batch_results = await asyncio.gather(*tasks)
                for latency, success in batch_results:
                    if success:
                        result.latencies_ms.append(latency)
                    else:
                        result.errors += 1
                tasks = []

        # Process remaining tasks
        if tasks:
            batch_results = await asyncio.gather(*tasks)
            for latency, success in batch_results:
                if success:
                    result.latencies_ms.append(latency)
                else:
                    result.errors += 1

        result.total_time_ms = (time.perf_counter() - start_time) * 1000

    print(f"Completed in {result.total_time_ms:.0f}ms")
    print(f"Errors: {result.errors}/{iterations}")

    return result


def print_results(cpp: BenchmarkResult, node: BenchmarkResult):
    """Print comparison table"""
    headers = ["Metric", "C++ (userver)", "Node.js", "Improvement"]

    def improvement(cpp_val, node_val):
        if node_val == 0: return "N/A"
        ratio = node_val / cpp_val if cpp_val > 0 else 0
        return "{:.2f}x".format(ratio)

    rows = [
        ["Iterations", str(cpp.iterations), str(node.iterations), "-"],
        ["Total time (ms)", "{:.0f}".format(cpp.total_time_ms), "{:.0f}".format(node.total_time_ms), "-"],
        ["RPS", "{:.0f}".format(cpp.rps), "{:.0f}".format(node.rps), "{:.2f}x".format(cpp.rps/node.rps) if node.rps > 0 else "N/A"],
        ["Avg latency (ms)", "{:.2f}".format(cpp.avg), "{:.2f}".format(node.avg), improvement(cpp.avg, node.avg)],
        ["Std Dev (ms)", "{:.2f}".format(cpp.stddev), "{:.2f}".format(node.stddev), "-"],
        ["p50 (ms)", "{:.2f}".format(cpp.p50), "{:.2f}".format(node.p50), improvement(cpp.p50, node.p50)],
        ["p90 (ms)", "{:.2f}".format(cpp.p90), "{:.2f}".format(node.p90), improvement(cpp.p90, node.p90)],
        ["p99 (ms)", "{:.2f}".format(cpp.p99), "{:.2f}".format(node.p99), improvement(cpp.p99, node.p99)],
        ["p99.9 (ms)", "{:.2f}".format(cpp.p999), "{:.2f}".format(node.p999), improvement(cpp.p999, node.p999)],
        ["Errors", str(cpp.errors), str(node.errors), "-"],
    ]

    print("\n" + "="*80)
    print("BENCHMARK RESULTS")
    print("="*80)

    if HAS_TABULATE:
        print(tabulate(rows, headers=headers, tablefmt="grid"))
    else:
        print("{:<20} {:<15} {:<15} {:<15}".format(*headers))
        print("-" * 80)
        for row in rows:
            print("{:<20} {:<15} {:<15} {:<15}".format(*row))

    print("="*80)


def print_histogram(latencies: List[float], bins: int = 20):
    """Print latency distribution histogram"""
    if not latencies:
        return

    min_val = min(latencies)
    max_val = max(latencies)
    bin_width = (max_val - min_val) / bins

    print("\nLatency Distribution:")
    print("-" * 50)

    for i in range(bins):
        bin_start = min_val + i * bin_width
        bin_end = bin_start + bin_width
        count = sum(1 for l in latencies if bin_start <= l < bin_end)

        bar = "#" * min(count, 50)
        percentage = (count / len(latencies)) * 100
        print("{:<7.1f} - {:<7.1f} ms | {:<50} {:>4d} ({:>5.1f}%)".format(
            bin_start, bin_end, bar, count, percentage))


async def main():
    parser = argparse.ArgumentParser(description="Astral SDK Benchmark")
    parser.add_argument("--cpp-url", default="http://localhost:8085/invites/test123",
                        help="C++ userver endpoint")
    parser.add_argument("--node-url", default="http://localhost:8082/invites/test123",
                        help="Node.js endpoint")
    parser.add_argument("--iterations", type=int, default=1000,
                        help="Number of requests")
    parser.add_argument("--concurrency", type=int, default=10,
                        help="Concurrent requests")

    args = parser.parse_args()

    print("""
+====================================================================+
|                Astral SDK Benchmark Suite                         |
+====================================================================+
|  Comparing: C++ userver vs Node.js                              |
|  Iterations: {:<51}|
|  Concurrency: {:<49}|
+====================================================================+
""".format(args.iterations, args.concurrency))

    # Run benchmarks
    cpp_result = await run_benchmark(
        "C++ userver",
        args.cpp_url,
        args.iterations,
        args.concurrency
    )

    # Small delay between tests
    await asyncio.sleep(0.5)

    node_result = await run_benchmark(
        "Node.js",
        args.node_url,
        args.iterations,
        args.concurrency
    )

    # Print results
    print_results(cpp_result, node_result)

    # Print histogram
    print_histogram(cpp_result.latencies_ms)
    print_histogram(node_result.latencies_ms)

    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    improvement_p50 = (node_result.p50 / cpp_result.p50 - 1) * 100 if cpp_result.p50 > 0 else 0
    improvement_p99 = (node_result.p99 / cpp_result.p99 - 1) * 100 if cpp_result.p99 > 0 else 0

    if improvement_p50 > 0:
        print("+ C++ is {:.0f}% faster at p50".format(improvement_p50))
    else:
        print("- C++ is {:.0f}% slower at p50".format(-improvement_p50))

    if improvement_p99 > 0:
        print("+ C++ is {:.0f}% faster at p99".format(improvement_p99))
    else:
        print("- C++ is {:.0f}% slower at p99".format(-improvement_p99))

    if cpp_result.rps > node_result.rps:
        print("+ C++ handles {:.1f}x more requests per second".format(cpp_result.rps/node_result.rps))
    else:
        print("- Node.js handles {:.1f}x more requests per second".format(node_result.rps/cpp_result.rps))

    print("="*80)


if __name__ == "__main__":
    asyncio.run(main())