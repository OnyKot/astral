#!/bin/bash
# Astral SDK — Quick benchmark with wrk
# Usage: ./benchmarks/wrk_benchmark.sh [URL]

URL="${1:-http://localhost:8085/invites/test123}"
DURATION="${2:-10s}"
THREADS="${3:-4}"
CONNECTIONS="${4:-100}"

echo "
╔══════════════════════════════════════════════════════════════════╗
║              Astral SDK — Quick Benchmark (wrk)                ║
╚══════════════════════════════════════════════════════════════════╝
"

echo "Target: $URL"
echo "Duration: $DURATION"
echo "Threads: $THREADS"
echo "Connections: $CONNECTIONS"
echo ""
echo "Running benchmark..."
echo ""

# Run wrk
wrk -t$THREADS -c$CONNECTIONS -d$DURATION "$URL" --latency

echo ""
echo "Compare with:"
echo "  ./wrk_benchmark.sh http://localhost:8082/invites/test123"