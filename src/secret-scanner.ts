import { execFile } from "child_process";
import { existsSync, unlinkSync, rmdirSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir, tmpdir, arch, platform } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LeakFinding {
  ruleId: string;
  description: string;
  startLine: number;
  endLine: number;
  match: string;
  tags: string[];
  severity: string;
}

export interface ScanResult {
  found: boolean;
  leaks: LeakFinding[];
}

export interface ScanOptions {
  allowSecrets?: boolean;
}

// ── Config resolution ─────────────────────────────────────────────────────

let _configPath: string | null | undefined = undefined;

function resolveConfigPath(): string | null {
  if (_configPath !== undefined) return _configPath;

  const envPath = process.env.GITLEAKS_CONFIG;
  if (envPath && existsSync(envPath)) { _configPath = envPath; return _configPath; }

  const projectRoot = process.env.GITAGENT_PROJECT_ROOT;
  if (projectRoot) {
    const p = join(projectRoot, ".gitleaks.toml");
    if (existsSync(p)) { _configPath = p; return _configPath; }
  }

  const cwd = join(process.cwd(), ".gitleaks.toml");
  if (existsSync(cwd)) { _configPath = cwd; return _configPath; }

  _configPath = null;
  return null;
}

let _configWritten = false;

const DEFAULT_CONFIG = `title = "GitAgent Secret Scanner"
[extend]
useDefault = true
`;

// ── Binary resolution + download ──────────────────────────────────────────

const CACHE_DIR = join(homedir(), ".gitleaks-cache");
let cachedBinary: string | null | undefined = undefined;

function resolveBinary(): string {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "gitleaks"),
    join(CACHE_DIR, "gitleaks"),
    "gitleaks",
  ];
  for (const c of candidates) {
    try { if (existsSync(c) || c === "gitleaks") return c; } catch {}
  }
  return "gitleaks";
}

function gitleaksURL(): string {
  const osMap: Record<string, string> = { linux: "linux", darwin: "darwin", win32: "windows" };
  const archMap: Record<string, string> = { x64: "x64", arm64: "arm64" };
  const os = osMap[platform()] ?? "linux";
  const a = archMap[arch()] ?? "x64";
  return `https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_${os}_${a}.tar.gz`;
}

async function downloadBinary(targetPath: string): Promise<boolean> {
  try {
    const url = gitleaksURL();
    mkdirSync(CACHE_DIR, { recursive: true });

    const tmp = join(CACHE_DIR, `gitleaks-dl-${Date.now()}.tar.gz`);
    const resp = await fetch(url);
    if (!resp.ok || !resp.body) return false;

    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }

    await writeFile(tmp, buf);
    await execFileAsync("tar", ["-xzf", tmp, "-C", CACHE_DIR, "gitleaks"]);
    unlinkSync(tmp);
    return existsSync(targetPath);
  } catch {
    return false;
  }
}

async function ensureBinary(): Promise<string | null> {
  if (cachedBinary !== undefined) return cachedBinary;

  const found = resolveBinary();
  if (found === "gitleaks") {
    try {
      await execFileAsync("gitleaks", ["version"], { timeout: 5000 });
      cachedBinary = "gitleaks";
      return cachedBinary;
    } catch {}
  }
  if (existsSync(found)) {
    cachedBinary = found;
    return cachedBinary;
  }

  const target = join(CACHE_DIR, "gitleaks");
  const ok = await downloadBinary(target);
  if (ok) {
    cachedBinary = target;
    return cachedBinary;
  }

  cachedBinary = null;
  console.warn("[secret-scanner] Failed to locate or download gitleaks binary, falling back to entropy scan");
  return null;
}

// ── Persistent temp directory ─────────────────────────────────────────────

const PID = process.pid;
const PERSISTENT_DIR = join(tmpdir(), `ga-scan-${PID}`);
let inited = false;
let scanCounter = 0;

function initPersistentDir(): void {
  if (inited) return;
  inited = true;
  mkdirSync(PERSISTENT_DIR, { recursive: true });

  const clean = () => {
    try { rmdirSync(PERSISTENT_DIR); } catch {}
  };
  process.on("exit", clean);
  process.on("SIGINT", () => { clean(); process.exit(130); });
  process.on("SIGTERM", () => { clean(); process.exit(143); });
}

// ── Entropy-based fallback ────────────────────────────────────────────────

function shannonEntropy(s: string): number {
  const len = s.length;
  if (len === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let ent = 0;
  for (const count of freq.values()) {
    const p = count / len;
    ent -= p * Math.log2(p);
  }
  return ent;
}

function entropyScan(content: string, mask: boolean = true): LeakFinding[] {
  const lines = content.split("\n");
  const findings: LeakFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 20) continue;

    // Strip common non-secret wrappers
    const cleaned = line.replace(/^['"`\s]+|['"`\s]+$/g, "");
    if (cleaned.length < 16) continue;

    const ent = shannonEntropy(cleaned);
    if (ent > 4.5) {
      findings.push({
        ruleId: "high-entropy-string",
        description: "High-entropy string (possible secret or token)",
        startLine: i + 1,
        endLine: i + 1,
        match: mask ? maskMatch(cleaned) : cleaned,
        tags: ["entropy", "fallback"],
        severity: "medium",
      });
    }
  }

  return findings;
}

// ── Report parsing ────────────────────────────────────────────────────────

function maskMatch(s: string): string {
  if (s.length <= 8) return s;
  return s.slice(0, 4) + "*".repeat(s.length - 8) + s.slice(-4);
}

async function readReport(path: string): Promise<LeakFinding[]> {
  try {
    const raw = await readFile(path, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    return entries.map((e: any) => ({
      ruleId: e.RuleID ?? "unknown",
      description: e.Description ?? "No description",
      startLine: e.StartLine ?? 0,
      endLine: e.EndLine ?? 0,
      match: maskMatch(e.Secret ?? ""),
      tags: e.Tags ?? [],
      severity: "medium",
    }));
  } catch {
    return [];
  }
}

// ── Warm-up ───────────────────────────────────────────────────────────────

let warmedUp = false;

function warmUp(bin: string): void {
  const emptyDir = join(PERSISTENT_DIR, ".warmup");
  try {
    mkdirSync(emptyDir, { recursive: true });
    const args = ["detect", "--no-git", "--source", emptyDir, "--report-format", "json"];
    const cfg = resolveConfigPath();
    if (cfg) args.push("--config", cfg);
    execFile(bin, args, { timeout: 10000 }).unref();
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────

export async function scanSecrets(content: string, options?: ScanOptions): Promise<ScanResult> {
  if (options?.allowSecrets) {
    return { found: false, leaks: [] };
  }
  if (!content?.trim()) {
    return { found: false, leaks: [] };
  }

  initPersistentDir();

  // Ensure gitleaks binary
  const bin = await ensureBinary();
  if (!bin) {
    const leaks = entropyScan(content);
    return { found: leaks.length > 0, leaks };
  }

  if (!warmedUp) { warmedUp = true; warmUp(bin); }

  // Write input to persistent temp dir (unique names per call)
  const id = ++scanCounter;
  const inputFile = join(PERSISTENT_DIR, `input-${id}.txt`);
  const reportFile = join(PERSISTENT_DIR, `report-${id}.json`);

  try { await writeFile(inputFile, content, "utf-8"); } catch {
    const leaks = entropyScan(content);
    return { found: leaks.length > 0, leaks };
  }

  // Build args
  const args = ["detect", "--no-git", "--source", PERSISTENT_DIR, "--report-format", "json", "--report-path", reportFile];
  const cfg = resolveConfigPath();
  if (cfg) {
    args.push("--config", cfg);
  } else if (!_configWritten) {
    const cfgFile = join(PERSISTENT_DIR, ".gitleaks.toml");
    try { await writeFile(cfgFile, DEFAULT_CONFIG, "utf-8"); _configWritten = true; args.push("--config", cfgFile); } catch {}
  } else {
    const cfgFile = join(PERSISTENT_DIR, ".gitleaks.toml");
    args.push("--config", cfgFile);
  }

  try {
    await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 });
  } catch {}

  const leaks = await readReport(reportFile);

  // Cleanup report and input (keep dir for reuse)
  try { unlinkSync(reportFile); } catch {}
  try { unlinkSync(inputFile); } catch {}

  return { found: leaks.length > 0, leaks };
}
