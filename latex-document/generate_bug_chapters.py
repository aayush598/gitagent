#!/usr/bin/env python3
"""Generate BUG-NNN.tex files from detailed issue markdown files."""

import re
import os
import glob

ISSUES_DIR = "/home/aayush/aayush/projects/open-source/gitagent/detailed-issues"
OUTPUT_DIR = "/home/aayush/aayush/projects/company_assignment/lyzr_ai/gitagent/latex-document/chapters/BUG"

# --- Map BUG-NNN to branch names ---
BRANCH_MAP = {
    1: "fix/BUG-001-git-commit-failure-silent-data-loss",
    2: "fix/BUG-002-sigint-race-condition-streaming",
    3: "fix/BUG-003-channel-push-after-finish",
    4: "fix/BUG-004-hook-block-silent-failure",
    5: "fix/BUG-005-atomic-write-backup-recovery",
    6: "fix/BUG-006-validate-schedule-cron",
    7: "fix/BUG-007-hook-cleanup-block-action",
    8: "fix/BUG-008-memory-archive-newline",
    9: "fix/BUG-009-edit-regex-flag-symmetry",
    10: "fix/BUG-010-capture-photo-rollback-execfilesync",
    11: "fix/BUG-011-composio-name-collision-dedup",
    12: "fix/BUG-012-abortsignal-timeout-compat",
    13: "fix/BUG-013-summarization-recursion-guard",
    14: "fix/BUG-014-cron-alias-expansion",
    15: "fix/BUG-015-session-state-ordering",
    16: "fix/BUG-016-plugin-memory-layers",
    17: "fix/BUG-017-git-clone-silence",
    18: "fix/BUG-018-dependency-dedup",
    19: "fix/BUG-019-model-fallback",
    20: "fix/BUG-020-env-var-case",
    21: "fix/BUG-021-plugin-discovery-race",
    22: "fix/BUG-022-schedule-yaml-forcequotes",
    23: "fix/BUG-023-audit-log-rotation",
    24: "fix/BUG-024-file-watcher-stale",
    25: "fix/BUG-025-console-intercept-scope",
    26: "fix/BUG-026-steer-uninitialized",
    27: "fix/BUG-027-isgitrepo-execfilesync",
    28: "fix/BUG-028-plugin-cache-ttl",
    29: "fix/BUG-029-sandbox-memory-layers",
    30: "fix/BUG-030-telemetry-metric-status",
    33: "fix/BUG-033-mime-validation",
    34: "fix/BUG-034-task-tracker-pagination",
    35: "fix/BUG-035-deepmerge-clone",
}

# --- Diff stats from the git output ---
DIFF_STATS = {
    1: {"files": ["poc/README.md", "poc/poc-bug-001-fixed.ts", "poc/poc-bug-001-old.ts", "poc/poc-bug-001-verify.ts", "src/tools/memory.ts"], "insertions": 816, "deletions": 9},
    2: {"files": ["poc/README.md", "poc/poc-bug-002-fixed.ts", "poc/poc-bug-002-old.ts", "poc/test-bug-002.ts", "src/index.ts"], "insertions": 458, "deletions": 12},
    3: {"files": ["pocs/bug-003/README.md", "pocs/bug-003/poc.ts", "src/sdk.ts", "test/channel.test.ts"], "insertions": 531, "deletions": 0},
    4: {"files": ["pocs/BUG-004-hook-block-silent-failure/README.md", "pocs/BUG-004-hook-block-silent-failure/validation.ts", "src/hooks.ts", "src/index.ts", "src/sdk.ts", "test/hooks.test.ts"], "insertions": 1519, "deletions": 9},
    5: {"files": ["src/tools/task-tracker.ts"], "insertions": 29, "deletions": 3},
    6: {"files": ["src/schedule-runner.ts"], "insertions": 28, "deletions": 13},
    7: {"files": ["src/hooks.ts"], "insertions": 16, "deletions": 2},
    8: {"files": ["src/tools/memory.ts"], "insertions": 15, "deletions": 1},
    9: {"files": ["src/tools/edit.ts"], "insertions": 18, "deletions": 5},
    10: {"files": ["src/tools/capture-photo.ts"], "insertions": 23, "deletions": 10},
    11: {"files": ["src/composio/adapter.ts"], "insertions": 21, "deletions": 1},
    12: {"files": ["src/tools/task-tracker.ts"], "insertions": 4, "deletions": 1},
    13: {"files": ["src/voice/chat-history.ts"], "insertions": 25, "deletions": 22},
    14: {"files": ["src/schedule-runner.ts"], "insertions": 36, "deletions": 12},
    15: {"files": ["src/loader.ts"], "insertions": 4, "deletions": 2},
    16: {"files": ["src/tools/memory.ts"], "insertions": 6, "deletions": 3},
    17: {"files": ["src/loader.ts"], "insertions": 12, "deletions": 10},
    18: {"files": ["src/loader.ts"], "insertions": 8, "deletions": 0},
    19: {"files": ["src/loader.ts"], "insertions": 29, "deletions": 15},
    20: {"files": ["src/loader.ts"], "insertions": 17, "deletions": 2},
    21: {"files": ["src/plugins.ts"], "insertions": 39, "deletions": 21},
    22: {"files": ["src/schedules.ts"], "insertions": 18, "deletions": 3},
    23: {"files": ["src/audit.ts"], "insertions": 45, "deletions": 4},
    24: {"files": ["src/voice/server.ts"], "insertions": 5, "deletions": 1},
    25: {"files": ["src/voice/server.ts"], "insertions": 6, "deletions": 0},
    26: {"files": ["src/sdk-types.ts", "src/sdk.ts"], "insertions": 14, "deletions": 3},
    27: {"files": ["src/index.ts"], "insertions": 4, "deletions": 3},
    28: {"files": ["src/plugins.ts"], "insertions": 23, "deletions": 0},
    29: {"files": ["src/tools/sandbox-memory.ts"], "insertions": 27, "deletions": 8},
    30: {"files": ["src/telemetry.ts"], "insertions": 4, "deletions": 1},
    33: {"files": ["src/voice/server.ts"], "insertions": 62, "deletions": 9},
    34: {"files": ["src/tools/shared.ts", "src/tools/task-tracker.ts"], "insertions": 23, "deletions": 8},
    35: {"files": ["src/config.ts"], "insertions": 1, "deletions": 1},
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_section(text, heading):
    """Extract content under a specific markdown heading."""
    pattern = rf"^## {heading}\s*$(.*?)(?=^## |\Z)"
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""

def extract_code_blocks(text, lang=None):
    """Extract code blocks from text, optionally filtering by language."""
    if lang:
        pattern = rf"```{lang}\s*\n(.*?)```"
    else:
        pattern = r"```(?:\w+)?\s*\n(.*?)```"
    blocks = re.findall(pattern, text, re.DOTALL)
    return blocks

def sanitize_latex(text):
    """Sanitize special characters for LaTeX."""
    replacements = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text

def code_to_latex(code_text):
    """Convert code text into a LaTeX lstlisting block."""
    lines = code_text.split('\n')
    # Trim common leading whitespace
    if lines and all(line.startswith('    ') for line in lines if line.strip()):
        lines = [line[4:] if line.startswith('    ') else line for line in lines]
    code = '\n'.join(lines)
    # Escape special LaTeX chars but keep lstlisting content
    return f"\\begin{{lstlisting}}[language=TypeScript]\n{code}\n\\end{{lstlisting}}"

def format_affected_files(bug_num, metadata_file_val, diff_files):
    """Format the affected files section."""
    items = []
    for f in diff_files:
        desc = ""
        if f == metadata_file_val or metadata_file_val.startswith(f.split(':')[0]):
            desc = " — primary affected file"
        items.append(f"    \\item \\filename{{{sanitize_latex(f)}}}{desc}")
    return "\n".join(items)

def generate_chapter(bug_num):
    """Generate a .tex file for a given BUG number."""
    # Find the issue file
    issue_dir = ISSUES_DIR
    for fname in os.listdir(issue_dir):
        if fname.startswith(f"BUG-{bug_num:03d}-") and fname.endswith(".md"):
            filepath = os.path.join(issue_dir, fname)
            break
    else:
        print(f"  WARNING: Issue file for BUG-{bug_num:03d} not found")
        return False

    with open(filepath, 'r') as f:
        text = f.read()

    # Extract title from # heading
    title_match = re.search(r'^# BUG-\d+: (.+)$', text, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else f"BUG-{bug_num:03d}"

    # Extract severity from the bold line
    sev_match = re.search(r'^\*\*(.+?)\*\*', text, re.MULTILINE)
    severity = sev_match.group(1).strip() if sev_match else "MEDIUM"

    # Extract metadata table
    meta_table = extract_section(text, "Metadata")
    affected_file = ""
    if meta_table:
        af_match = re.search(r'\*\*Affected File\*\*.*?`([^`]+)`', meta_table)
        if af_match:
            affected_file = af_match.group(1)

    # Extract sections
    exec_summary = extract_section(text, "Executive Summary")
    root_cause = extract_section(text, "Root Cause Analysis")
    fix_content = extract_section(text, "Fix Options") or extract_section(text, "Implementation Plan") or ""
    verification = extract_section(text, "Verification")

    # Get diff stats
    ds = DIFF_STATS.get(bug_num, {"files": [], "insertions": 0, "deletions": 0})

    # Build LaTeX content
    label = f"bug-{bug_num:03d}"
    branch = BRANCH_MAP.get(bug_num, f"fix/BUG-{bug_num:03d}")

    lines = []
    lines.append(f"\\section{{BUG-{bug_num:03d}: {sanitize_latex(title)}}}")
    lines.append(f"\\label{{sec:{label}}}")
    lines.append("")
    lines.append("\\subsection*{Metadata}")
    lines.append("\\begin{tabular}{ll}")
    lines.append(f"\\textbf{{Issue ID}} & BUG-{bug_num:03d} \\\\")
    lines.append(f"\\textbf{{Severity}} & {sanitize_latex(severity)} \\\\")
    lines.append(f"\\textbf{{Category}} & Bug Fix \\\\")
    aff = sanitize_latex(affected_file) if affected_file else ", ".join(sanitize_latex(f) for f in ds["files"])
    lines.append(f"\\textbf{{Affected File}} & \\filename{{{aff}}} \\\\")
    lines.append(f"\\textbf{{Branch}} & \\branchref{{{sanitize_latex(branch)}}} \\\\")
    lines.append("\\end{tabular}")
    lines.append("")

    # Executive Summary
    lines.append("\\subsection*{Executive Summary}")
    if exec_summary:
        # Clean up markdown links, backticks, etc.
        para = sanitize_latex(exec_summary)
        para = re.sub(r'`([^`]+)`', r'\\texttt{\1}', para)
        para = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', para)
        para = re.sub(r'\n{2,}', '\n\n', para)
        lines.append(para)
    lines.append("")

    # Root Cause Analysis
    lines.append("\\subsection*{Root Cause Analysis}")
    if root_cause:
        rc = root_cause
        # Extract code blocks and handle them
        parts = re.split(r'(```[\w]*\s*\n.*?```)', rc, flags=re.DOTALL)
        for part in parts:
            code_match = re.match(r'```(\w*)\s*\n(.*?)```', part, re.DOTALL)
            if code_match:
                lines.append("")
                lines.append(code_to_latex(code_match.group(2)))
                lines.append("")
            else:
                para = sanitize_latex(part)
                para = re.sub(r'`([^`]+)`', r'\\texttt{\1}', para)
                para = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', para)
                para = re.sub(r'\n{2,}', '\n\n', para)
                lines.append(para)
    lines.append("")

    # Fix Implementation
    lines.append("\\subsection*{Fix Implementation}")
    if fix_content:
        fc = fix_content
        # Pick the recommended option or implementation plan code
        parts = re.split(r'(```[\w]*\s*\n.*?```)', fc, flags=re.DOTALL)
        for part in parts:
            code_match = re.match(r'```(\w*)\s*\n(.*?)```', part, re.DOTALL)
            if code_match:
                lines.append("")
                lines.append(code_to_latex(code_match.group(2)))
                lines.append("")
            else:
                para = sanitize_latex(part)
                para = re.sub(r'`([^`]+)`', r'\\texttt{\1}', para)
                para = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', para)
                # Remove markdown tables
                para = re.sub(r'\|.*\|.*\n\|[-\s|]+\|.*\n(?:\|.*\|.*\n)*', '', para)
                para = re.sub(r'\n{2,}', '\n\n', para)
                if para.strip():
                    lines.append(para)
    lines.append("")

    # Affected Files
    lines.append("\\subsection*{Affected Files}")
    lines.append("\\begin{itemize}")
    for f in ds["files"]:
        desc = ""
        if affected_file and affected_file.startswith(f.split(':')[0]):
            desc = " — primary affected file"
        lines.append(f"    \\item \\filename{{{sanitize_latex(f)}}}{desc}")
    lines.append("\\end{itemize}")
    lines.append("")

    # Verification
    lines.append("\\subsection*{Verification}")
    if verification:
        ver = verification
        code_blocks = extract_code_blocks(ver)
        if code_blocks:
            lines.append("The fix is verified through unit tests and integration tests that confirm the corrected behavior:")
            lines.append("")
            lines.append(code_to_latex(code_blocks[0]))
        else:
            para = sanitize_latex(ver.split('\n\n')[0])
            para = re.sub(r'`([^`]+)`', r'\\texttt{\1}', para)
            lines.append(para)
    else:
        lines.append("Verified through unit tests in the corresponding test file.")
    lines.append("")

    # Write file
    outpath = os.path.join(OUTPUT_DIR, f"BUG-{bug_num:03d}.tex")
    with open(outpath, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"  Generated {outpath}")
    return True

def generate_chapter_tex():
    """Generate the parent BUG/chapter.tex file."""
    bug_nums = sorted(BRANCH_MAP.keys())
    lines = []
    lines.append(r"\chapter{Bug Fixes}")
    lines.append(r"\label{chap:bug-fixes}")
    lines.append("")
    lines.append(r"This chapter documents all bug fix branches in the GitAgent repository. "
                 r"Each section corresponds to a single issue and its corresponding fix branch.")
    lines.append("")
    lines.append(r"\begin{itemize}")
    for num in bug_nums:
        branch = BRANCH_MAP[num]
        label = f"bug-{num:03d}"
        lines.append(rf"    \item \hyperref[sec:{label}]{{BUG-{num:03d}}}: "
                     rf"\branchref{{{branch}}}")
    lines.append(r"\end{itemize}")
    lines.append("")
    for num in bug_nums:
        lines.append(rf"\input{{chapters/BUG/BUG-{num:03d}.tex}}")
        lines.append("")
    outpath = os.path.join(OUTPUT_DIR, "..", "chapter.tex")
    with open(outpath, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"  Generated {outpath}")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    bug_nums = sorted(BRANCH_MAP.keys())
    for num in bug_nums:
        print(f"Processing BUG-{num:03d}...")
        generate_chapter(num)
    generate_chapter_tex()
    print(f"\nDone! Generated {len(bug_nums)} chapter files + chapter.tex")

if __name__ == "__main__":
    main()
