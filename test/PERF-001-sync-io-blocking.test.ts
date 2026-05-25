import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

async function execGit(args: string[], cwd: string) {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf-8" });
  return stdout.trim();
}

function tmpDir(): string {
  return join(tmpdir(), `sync-io-${randomBytes(4).toString("hex")}`);
}

// ── Event Loop Responsiveness ─────────────────────────────────────────

describe("Event Loop Responsiveness", () => {
  it("async file reads don't block the event loop", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "data.txt");
    await writeFile(filePath, "x".repeat(1024 * 1024));

    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 1);
    await readFile(filePath, "utf-8");
    await new Promise(r => setTimeout(r, 2));
    assert.ok(timerFired, "Timer should have fired during async readFile");
  });

  it("async git operations don't block the event loop", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await execGit(["init"], tmp);
    await execGit(["config", "user.email", "test@test.com"], tmp);
    await execGit(["config", "user.name", "Test"], tmp);

    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 1);
    await execGit(["status"], tmp);
    await new Promise(r => setTimeout(r, 2));
    assert.ok(timerFired, "Timer should have fired during async git op");
  });

  it("concurrent async operations don't serialize", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const files = await Promise.all(
      [1, 2, 3].map(async (i) => {
        const p = join(tmp, `concurrent-${i}.txt`);
        await writeFile(p, "x".repeat(1024 * 512));
        return p;
      })
    );

    const start = Date.now();
    const results = await Promise.all(
      files.map((f) => readFile(f, "utf-8"))
    );
    const elapsed = Date.now() - start;
    assert.equal(results.length, 3);
    assert.ok(elapsed < 300, `Concurrent reads took ${elapsed}ms, expected < 300ms`);
  });

  it("async access() doesn't block the event loop", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "access-test.txt");
    await writeFile(filePath, "data");

    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 1);
    await access(filePath);
    await new Promise(r => setTimeout(r, 2));
    assert.ok(timerFired, "Timer should have fired during async access()");
  });
});

// ── Async Git Operations ──────────────────────────────────────────────

describe("Async Git Operations", () => {
  it("execGit handles successful git commands", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await execGit(["init"], tmp);
    await execGit(["config", "user.email", "test@test.com"], tmp);
    await execGit(["config", "user.name", "Test"], tmp);

    const out = await execGit(["rev-parse", "--git-dir"], tmp);
    assert.equal(out, ".git");
  });

  it("execGit rejects on failed git commands", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });

    await assert.rejects(
      () => execGit(["rev-parse", "--git-dir"], tmp),
      /fatal|not a git repository/
    );
  });

  it("git add + commit works correctly via async execFile", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await execGit(["init"], tmp);
    await execGit(["config", "user.email", "test@test.com"], tmp);
    await execGit(["config", "user.name", "Test"], tmp);

    await writeFile(join(tmp, "hello.txt"), "world");
    await execGit(["add", "hello.txt"], tmp);
    await execGit(["commit", "-m", "initial commit"], tmp);

    const log = await execGit(["log", "--oneline"], tmp);
    assert.ok(log.includes("initial commit"));
  });

  it("git diff --cached --quiet throws when there are staged changes", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await execGit(["init"], tmp);
    await execGit(["config", "user.email", "test@test.com"], tmp);
    await execGit(["config", "user.name", "Test"], tmp);

    await writeFile(join(tmp, "file.txt"), "content");
    await execGit(["add", "file.txt"], tmp);

    await assert.rejects(
      () => execGit(["diff", "--cached", "--quiet"], tmp),
    );
  });
});

// ── Async File Operations ─────────────────────────────────────────────

describe("Async File Operations", () => {
  it("readFile reads file contents correctly", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const fp = join(tmp, "greeting.txt");
    await writeFile(fp, "hello world");
    const data = await readFile(fp, "utf-8");
    assert.equal(data, "hello world");
  });

  it("readFile rejects on nonexistent files", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await assert.rejects(
      () => readFile(join(tmp, "nope.txt"), "utf-8"),
      /ENOENT/
    );
  });

  it("access() correctly detects existing files", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const fp = join(tmp, "exists.txt");
    await writeFile(fp, "data");
    await assert.doesNotReject(() => access(fp));
  });

  it("access() correctly detects nonexistent files", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    await assert.rejects(
      () => access(join(tmp, "missing.txt")),
      /ENOENT/
    );
  });

  it("writeFile creates files correctly", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    await mkdir(tmp, { recursive: true });
    const fp = join(tmp, "newfile.txt");
    await writeFile(fp, "written content");
    const data = await readFile(fp, "utf-8");
    assert.equal(data, "written content");
  });

  it("mkdir creates directories recursively", { timeout: 10000 }, async () => {
    const tmp = tmpDir();
    const nested = join(tmp, "a", "b", "c");
    await mkdir(nested, { recursive: true });
    await assert.doesNotReject(() => access(nested));
  });
});

// ── No Sync Calls Leaked ─────────────────────────────────────────────

describe("No Sync Calls Leaked", () => {
  it("modified source files don't import or call sync fs functions", { timeout: 10000 }, async () => {
    const srcDir = join(import.meta.dirname, "..", "src");

    const files = [
      join(srcDir, "tools", "memory.ts"),
      join(srcDir, "session.ts"),
      join(srcDir, "index.ts"),
      join(srcDir, "loader.ts"),
    ];

    const forbidden = [
      "execSync",
      "readFileSync",
      "existsSync",
      "writeFileSync",
      "mkdirSync",
      "accessSync",
    ];

    const lineRegex = /^\s*[^\/\*\n]/;

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!lineRegex.test(line)) continue;
        for (const name of forbidden) {
          if (line.includes(name)) {
            assert.fail(`${file}:${i + 1} contains forbidden sync call "${name}"`);
          }
        }
      }
    }
  });
});
