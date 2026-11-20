# Spid3rWeb Benchmark Results

**Date:** 2026-11-20 · **Toolchain:** Spid3r `v1.1.1` (Language `1.1.1`, Bytecode VM default + LLVM 23.1.0 AOT) · **Machine:** Windows 11, local NVMe (developer desktop; absolute numbers are host-specific, compare ratios) · **Method:** `benchmarks/bench.matrix` — fixed iterations, warm-up pass, wall-clock `now_ms()`. SQLite (file) driver.

## Results (v1.1.1 vs 2026-11-07 v1.0.0 Baseline)

| Benchmark | 2026-11-07 Tree (old default) | 2026-11-07 VM | v1.1.1 VM (default) | v1.1.1 LLVM-23 AOT (`--release`) | AOT vs old default |
|---|---:|---:|---:|---:|---:|
| Route matching (200 routes, `:param` capture) | 55,555 ops/sec | 133,333 ops/sec | **153,846 ops/sec** (13 ms) | **200,000 ops/sec** (10 ms) | **3.60×** |
| Query compilation (4 clauses + whereIn + orderBy) | 13,888 ops/sec | 20,547 ops/sec | **21,428 ops/sec** (140 ms) | **27,027 ops/sec** (111 ms) | **1.95×** |
| JSON write+parse round-trip (nested) | 250,000 ops/sec | 333,333 ops/sec | **666,666 ops/sec** (3 ms) | **1,000,000 ops/sec** (2 ms) | **4.00×** |
| BD template render (interpolation + loop) | 6,153 ops/sec | 9,569 ops/sec | **9,661 ops/sec** (207 ms) | **12,500 ops/sec** (160 ms) | **2.03×** |
| SQLite INSERT ×200 (single inserts) | 486 ops/sec | 429 ops/sec | 694 ops/sec (288 ms) | 689 ops/sec (290 ms) | (I/O bound) |
| SQLite SELECT ×300 (WHERE > over 200 rows) | 4,838 ops/sec | 5,263 ops/sec | 5,263 ops/sec (57 ms) | **6,122 ops/sec** (49 ms) | **1.27×** |
| SQLite UPDATE ×200 (by pk) | 803 ops/sec | 826 ops/sec | 662 ops/sec (302 ms) | 675 ops/sec (296 ms) | (I/O bound) |

## Architecture Highlights

- **O(1) Static & Prefix-Indexed Dynamic Routing**: `Router.matrix` uses an O(1) hash table for static routes and a 2-level segment-length + literal-prefix index (`s1/s2` and `s1`) with pre-split segment arrays for dynamic routes — reaching **153,846 ops/sec** on the v1.1.1 VM and **200,000 ops/sec** on LLVM-23 AOT.
- **Pre-Compiled SpiderBD v2 Templates**: `BD.matrix` caches pre-processed template line arrays (invalidated by `file_mtime`), reaching **9,661 renders/sec** on VM and **12,500 renders/sec** on AOT.
- **Bytecode VM Default + LLVM-23 AOT**: Since Spid3r v1.1+, `spid3r run` executes on the bytecode VM by default, and `spid3r magic build --release` compiles the full framework to a standalone native executable.

Reproduce:

```bash
SPID3R_PATH=. SPID3R_DB_DRIVER=sqlite spid3r run benchmarks/bench.matrix
SPID3R_PATH=. SPID3R_DB_DRIVER=sqlite spid3r build --release benchmarks/bench.matrix -o bench_aot && ./bench_aot
```

## Performance Gate (`--gate`)

CI enforces both the toolchain floor check and Spid3rWeb's framework micro-benchmark floors (~1/4 of the v1.1.1 VM baseline to catch catastrophic regressions without failing on shared-runner noise):

| Gate | Minimum Floor | v1.1.1 VM Reference |
|---|---:|---:|
| `route_matching` | `20,000 ops/sec` | `153,846 ops/sec` |
| `query_compilation` | `4,000 ops/sec` | `21,428 ops/sec` |
| `json_roundtrip` | `60,000 ops/sec` | `666,666 ops/sec` |
| `view_render` | `1,500 ops/sec` | `9,661 ops/sec` |
| `sqlite_select` | `800 ops/sec` | `5,263 ops/sec` |

Single-row SQLite `INSERT` and `UPDATE` remain informational (filesystem `fsync`/I/O bound). Run the full gate locally:

```bash
spid3r bench --runs 1 --gate benchmarks/bench.matrix
spid3r magic bench --gate
```
