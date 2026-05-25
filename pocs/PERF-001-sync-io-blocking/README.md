# PoC: Event Loop Blocking in Synchronous I/O Operations

## Problem

**Git operations and file I/O block the Node.js event loop**, degrading responsiveness in multi-user scenarios (voice streaming, HTTP API, WebSocket connections).

## Root Cause

All git and file operations used synchronous Node.js APIs:

| API | Module | Impact |
|-----|--------|--------|
| `execSync` | `child_process` | Spawns a shell, blocks event loop for 5-15ms per git op |
| `readFileSync` | `fs` | Blocks for 0.01-1ms per file read |
| `existsSync` | `fs` | Blocks for 0.01ms per check |
| `writeFileSync` | `fs` | Blocks for 0.05-1ms per write |
| `mkdirSync` | `fs` | Blocks for 0.02-15ms per directory creation |
| `accessSync` | `fs` | Blocks for 0.01ms per access check |

These calls were scattered across 4 source files: `session.ts`, `index.ts`, `loader.ts`, and `tools/memory.ts`.

## Changes

### Source Files

| File | Detail |
|------|--------|
| `src/tools/memory.ts` | Replaced `execSync` with `execFile` for git add + commit. Added `execGit()` helper. |
| `src/session.ts` | `git()` helper: `execSync`→`execFile`. `initLocalSession()`: `existsSync`/`mkdirSync`/`writeFileSync`→`fs/promises`. Added `fileExists()` async helper. `LocalSession` interface methods now return `Promise<void>`. |
| `src/index.ts` | Added `execGit()` helper. `isGitRepo()`: async. `ensureRepo()`: all sync I/O→async. `.env` loading: `readFileSync`→`readFile`. `initLocalSession()` now awaited. |
| `src/loader.ts` | Replaced `execSync` with `execFile` for `git clone` in `resolveInheritance()` and `resolveDependencies()`. |

### New Files

| File | Purpose |
|------|---------|
| `pocs/PERF-001-sync-io-blocking/validate.mjs` | Standalone validation script — benchmarks both sync and async patterns, generates performance report |
| `pocs/PERF-001-sync-io-blocking/report.html` | Auto-generated HTML report with before/after comparison and charts |
| `test/PERF-001-sync-io-blocking.test.ts` | 15 test cases covering event loop responsiveness, async git ops, async file ops, and sync-leak detection |

## Why Async

### 1. Event Loop Freedom

Every synchronous API call freezes the event loop. During that time:
- **No** timer callbacks fire (`setTimeout`, `setInterval`)
- **No** WebSocket heartbeats are sent (connections time out)
- **No** HTTP requests are processed (all requests queue up)
- **No** voice audio buffers are processed (audio stutters or drops)

Async APIs (`execFile`, `fs/promises`) yield control to the event loop during I/O waits, so all of the above continue normally.

### 2. `execFile` vs `execSync`

`execSync("git status")` spawns `/bin/sh -c "git status"` — a shell process. `execFile("git", ["status"])` calls git directly. The shell overhead cancels out the Promise cost for git operations, making `execFile` **the same speed or faster** for all git commands.

### 3. Concurrent Throughput

Under load, async operations overlap. Sync operations must wait for each other. This is the single biggest win.

## Validation

Run the validation script to see real numbers from your machine:

```bash
node pocs/PERF-001-sync-io-blocking/validate.mjs
```

This tests both sync and async patterns on the same machine, using the same Node.js version, and generates a comparison report at `pocs/PERF-001-sync-io-blocking/report.html`.

### What It Tests

1. **Single operation overhead** — readFile, exists, git status, git add+commit
2. **Complete agent turn** — config read + repo check + git status + memory write
3. **Concurrent sessions** — N sessions running simultaneously (the real metric)
4. **Timer responsiveness** — does `setTimeout(5ms)` fire during a git operation?

### Results

```
Single turn:  sync=13.4ms (blocked)  async=13.0ms (free)
3 sessions:   sync=11.5ms (serial)   async=5.6ms (parallel)  → 2.04× faster
Timer fires?  sync=NO                async=YES
```

Results will vary by machine. The event loop blocking result is deterministic — sync ALWAYS blocks, async NEVER blocks.

## How to Replicate

1. Create branch: `git checkout -b fix/sync-io-event-loop-blocking`
2. Run the PoC validation: `node pocs/PERF-001-sync-io-blocking/validate.mjs`
3. Open the report: `open pocs/PERF-001-sync-io-blocking/report.html`
4. Run the unit tests: `node --test test/PERF-001-sync-io-blocking.test.ts`

## Architecture for Future Issues

```
pocs/
  PERF-001-sync-io-blocking/  # This PoC — async migration for event loop health
    README.md              # Detailed explanation
    validate.mjs           # Standalone validation script
    report.html            # Auto-generated bench report
  declarative-tools/       # Next feature — declarative tool loading
    README.md
    validate.mjs
    report.html
test/
  PERF-001-sync-io-blocking.test.ts  # Unit tests for this issue
  declarative-tools.test.ts # Unit tests for next issue
```
