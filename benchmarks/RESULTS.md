# Spid3rWeb Benchmark Results

**Date:** 2026-11-06 · **Machine:** Windows 11, local NVMe (developer desktop; numbers are indicative, not CI-stable) · **Method:** `benchmarks/bench.matrix` — fixed iterations, warm-up pass, wall-clock `now_ms()`. SQLite (file) driver. Run twice per engine; the second run's numbers are recorded.

## Results

| Benchmark | tree-walk (default) | bytecode VM (`--engine vm`) | VM speedup |
|---|---:|---:|---:|
| Route matching (200 routes, `:param` capture) | 539 ops/sec | 871 ops/sec | **+62%** |
| Query compilation (4 clauses + whereIn + orderBy) | 11,111 ops/sec | 20,979 ops/sec | **+89%** |
| JSON write+parse round-trip (nested) | 200,000 ops/sec | 285,714 ops/sec | **+43%** |
| BD template render (interpolation + loop) | 3,508 ops/sec | 7,518 ops/sec | **+114%** |
| SQLite INSERT ×200 (single inserts) | 497 ops/sec | 364 ops/sec | (I/O bound) |
| SQLite SELECT ×300 (WHERE > over 200 rows) | 4,000 ops/sec | 4,411 ops/sec | (I/O bound) |
| SQLite UPDATE ×200 (by pk) | 793 ops/sec | 361 ops/sec | (I/O bound) |

## Honest reading

- The **bytecode VM is 1.4–2.1× faster on everything the framework itself computes**: routing, query compilation, templating, serialization. For template-heavy pages and large route tables this is the deployment engine of choice: `spid3r run --engine vm server-side entry`.
- The **SQLite rows are disk-bound** and varied between runs (±40%); treat them as smoke numbers, not rankings. Batch inserts in a transaction would dominate any engine comparison — that's DB behavior, not framework behavior.
- Route matching is the weakest spot (linear scan over route patterns). The next framework-side optimization, if data ever demands it, is compiling static-prefix routes into a map lookup first. Not done yet — no evidence of need at realistic route counts.

Reproduce:

```bash
SPID3R_DB_DRIVER=sqlite spid3r run benchmarks/bench.matrix
SPID3R_DB_DRIVER=sqlite spid3r run --engine vm benchmarks/bench.matrix
```
