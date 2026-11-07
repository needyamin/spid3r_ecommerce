# Spid3rWeb Benchmark Results

**Date:** 2026-11-07 · **Machine:** Windows 11, local NVMe (developer desktop; numbers are indicative, not CI-stable) · **Method:** `benchmarks/bench.matrix` — fixed iterations, warm-up pass, wall-clock `now_ms()`. SQLite (file) driver.

## Results

| Benchmark | tree-walk (default) | bytecode VM (`--engine vm`) | VM speedup |
|---|---:|---:|---:|
| Route matching (200 routes, `:param` capture) | 55,555 ops/sec | 133,333 ops/sec | **+140%** (153× faster vs legacy linear router) |
| Query compilation (4 clauses + whereIn + orderBy) | 13,888 ops/sec | 20,547 ops/sec | **+48%** |
| JSON write+parse round-trip (nested) | 250,000 ops/sec | 333,333 ops/sec | **+33%** |
| BD template render (interpolation + loop) | 6,153 ops/sec | 9,569 ops/sec | **+56%** (+27% faster with pre-compiled line cache) |
| SQLite INSERT ×200 (single inserts) | 486 ops/sec | 429 ops/sec | (I/O bound) |
| SQLite SELECT ×300 (WHERE > over 200 rows) | 4,838 ops/sec | 5,263 ops/sec | (I/O bound) |
| SQLite UPDATE ×200 (by pk) | 803 ops/sec | 826 ops/sec | (I/O bound) |

## Architecture Highlights

- **O(1) Static & Prefix-Indexed Dynamic Routing**: `Router.matrix` uses an O(1) hash table for static routes and a 2-level segment-length + literal-prefix index (`s1/s2` and `s1`) with pre-split segment arrays for dynamic routes. Route matching over 200 routes jumped from **871 ops/sec** to **133,333 ops/sec** on the bytecode VM (**153× speedup**).
- **Pre-Compiled SpiderBD v2 Templates**: `BD.matrix` caches pre-processed template line arrays (with `@extends`, `@section`, `@yield`, `@include`, `@csrf`, and `@method` resolved once per file modification time), increasing template rendering throughput to **9,569 renders/sec** on the VM.
- **Bytecode VM (`--engine vm`)**: 1.3–2.4× faster across all CPU-bound framework operations.

Reproduce:

```bash
SPID3R_DB_DRIVER=sqlite spid3r run benchmarks/bench.matrix
SPID3R_DB_DRIVER=sqlite spid3r run --engine vm benchmarks/bench.matrix
```
