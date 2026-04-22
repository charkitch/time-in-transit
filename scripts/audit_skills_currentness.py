#!/usr/bin/env python3
"""Audit repo-local Codex skills for stale repository references."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = ROOT / ".agents" / "skills"
SEARCH_ROOTS = [
    ROOT / "src",
    ROOT / "engine" / "src",
    ROOT / "engine" / "content",
    ROOT / "engine" / "content-types" / "src",
]
PATH_SEARCH_ROOTS = [
    ROOT,
    ROOT / "src",
    ROOT / "engine" / "src",
    ROOT / "engine" / "content",
    ROOT / "engine" / "content" / "events",
    ROOT / "story",
]

BACKTICK_RE = re.compile(r"`([^`\n]+)`")
SYMBOL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\(\))?$")
COMMAND_NAMES = {
    "cargo",
    "cd",
    "find",
    "git",
    "npm",
    "npx",
    "python",
    "python3",
    "rg",
    "wasm-pack",
}
IGNORED_TOKENS = {"*/*", "../", "./"}
PATH_EXTENSIONS = {".md", ".rs", ".ts", ".tsx", ".js", ".jsx", ".yaml", ".yml", ".toml", ".json", ".glsl"}

STALE_PATTERNS = [
    (
        "engine/src/types.rs",
        "Rust types are split under engine/src/types/ and content enum definitions are in engine/content-types/src/lib.rs.",
    ),
    (
        "line ~",
        "Line-number hints in skills drift quickly; prefer symbol and file references.",
    ),
]


@dataclass
class Finding:
    skill: str
    severity: str
    line: int
    token: str
    message: str


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root in SEARCH_ROOTS:
        if root.exists():
            files.extend(
                path
                for path in root.rglob("*")
                if path.is_file()
                and path.suffix
                in {".rs", ".ts", ".tsx", ".js", ".jsx", ".glsl", ".yaml", ".yml"}
            )
    return files


def build_source_index(files: list[Path]) -> str:
    parts: list[str] = []
    for path in files:
        try:
            parts.append(path.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            continue
    return "\n".join(parts)


def normalize_path_token(token: str) -> str | None:
    token = token.strip().strip(",:;)]")
    if token in IGNORED_TOKENS:
        return None
    if token.startswith("my_"):
        return None
    if "<" in token or ">" in token:
        return None
    if token.startswith("/"):
        return None
    if token.startswith(("http://", "https://")):
        return None
    if token.startswith("$"):
        return None
    if " " in token and "/" not in token:
        return None
    if any(token.startswith(cmd + " ") for cmd in COMMAND_NAMES):
        return None
    if token.endswith("()"):
        return None
    if re.search(r"\([^)]*$", token):
        return None
    if "/" not in token and not re.search(r"\.[A-Za-z0-9]+$", token):
        return None
    if "/" not in token and Path(token).suffix not in PATH_EXTENSIONS and token != "Makefile":
        return None
    if "*" in token:
        return None
    return token


def looks_like_symbol(token: str) -> bool:
    if token in COMMAND_NAMES:
        return False
    if token == "Makefile" or (ROOT / token).exists():
        return False
    if "/" in token or "." in token or " " in token or token.startswith("/"):
        return False
    if token in {"errors", "warnings", "updates", "remaining"}:
        return False
    return bool(SYMBOL_RE.match(token))


def symbol_exists(symbol: str, source_index: str) -> bool:
    bare = symbol.removesuffix("()")
    if not bare:
        return True
    return re.search(rf"\b{re.escape(bare)}\b", source_index) is not None


def relative_exists(token: str, all_paths: set[str], basenames: set[str]) -> bool:
    if token in all_paths:
        return True
    if "/" not in token and token in basenames:
        return True
    candidates = [root / token for root in PATH_SEARCH_ROOTS]
    if token.endswith("/"):
        candidates.extend(root / token.rstrip("/") for root in PATH_SEARCH_ROOTS)
    return any(candidate.exists() for candidate in candidates)


def audit_skill(
    skill_path: Path,
    source_index: str,
    all_paths: set[str],
    basenames: set[str],
) -> list[Finding]:
    findings: list[Finding] = []
    skill = str(skill_path.relative_to(ROOT))
    try:
        lines = skill_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [Finding(skill, "error", 0, str(skill_path), f"Could not read skill: {exc}")]

    for line_no, line in enumerate(lines, start=1):
        for pattern, message in STALE_PATTERNS:
            if pattern in line:
                findings.append(Finding(skill, "warning", line_no, pattern, message))

        for raw in BACKTICK_RE.findall(line):
            token = raw.strip()

            path_token = normalize_path_token(token)
            if path_token and not relative_exists(path_token, all_paths, basenames):
                findings.append(
                    Finding(
                        skill,
                        "error",
                        line_no,
                        path_token,
                        "Referenced file or directory does not exist.",
                    )
                )
                continue

            if looks_like_symbol(token) and not symbol_exists(token, source_index):
                findings.append(
                    Finding(
                        skill,
                        "warning",
                        line_no,
                        token,
                        "Referenced symbol was not found under src/ or engine/src/.",
                    )
                )

    return findings


def print_human(findings: list[Finding]) -> None:
    if not findings:
        print("No skill currentness findings.")
        return

    by_skill: dict[str, list[Finding]] = {}
    for finding in findings:
        by_skill.setdefault(finding.skill, []).append(finding)

    for skill, skill_findings in by_skill.items():
        print(f"\n{skill}")
        for finding in skill_findings:
            location = f"line {finding.line}" if finding.line else "file"
            print(f"  [{finding.severity}] {location}: `{finding.token}` - {finding.message}")

    counts = {severity: 0 for severity in ("error", "warning", "info")}
    for finding in findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
    print(
        f"\nSummary: {counts.get('error', 0)} errors, "
        f"{counts.get('warning', 0)} warnings, {counts.get('info', 0)} info"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a text report.")
    args = parser.parse_args()

    if not SKILLS_DIR.exists():
        print(f"Skill directory not found: {SKILLS_DIR}", file=sys.stderr)
        return 2

    source_index = build_source_index(iter_source_files())
    repo_paths = [path for path in ROOT.rglob("*") if path.is_file() or path.is_dir()]
    all_paths = {str(path.relative_to(ROOT)) for path in repo_paths}
    basenames = {path.name for path in repo_paths}
    skill_paths = sorted(SKILLS_DIR.glob("*/SKILL.md"))
    findings = [
        finding
        for skill_path in skill_paths
        for finding in audit_skill(skill_path, source_index, all_paths, basenames)
    ]

    if args.json:
        print(json.dumps([asdict(finding) for finding in findings], indent=2))
    else:
        print_human(findings)

    return 1 if any(finding.severity == "error" for finding in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
