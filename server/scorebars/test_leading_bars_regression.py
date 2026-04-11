#!/usr/bin/env python3
"""
Regression check for missing leading bars per system.

Usage:
  python3 server/scorebars/test_leading_bars_regression.py \
    /absolute/path/to/example.png

If no argument is provided, the script uses the known failing-example asset path
from this workspace session.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import defaultdict

DEFAULT_IMAGE = "/Users/nirajsuresh/.cursor/projects/Users-nirajsuresh-Documents-HBS-2026-Spring-Reperto-IP-Reperto/assets/image-a2697bb4-93b8-4284-8594-e09d1b3e9da6.png"
LOCAL_PY = "server/scorebars/.venv/bin/python"
PYTHON = os.environ.get("SCOREBARS_PYTHON") or (LOCAL_PY if os.path.exists(LOCAL_PY) else "python3")


def run_detector(path: str):
    r = subprocess.run(
        [PYTHON, "server/scorebars/detect_bars.py", path],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    data = json.loads(r.stdout)
    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(data["error"])
    if not isinstance(data, list):
        raise RuntimeError("Unexpected detector output shape")
    return data


def main() -> int:
    image_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE
    if not os.path.exists(image_path):
        print(f"FAIL: image not found: {image_path}")
        return 1

    boxes = run_detector(image_path)
    by_system = defaultdict(list)
    for b in boxes:
        by_system[round(float(b["y"]), 3)].append(b)

    systems = sorted(by_system.items(), key=lambda kv: kv[0])
    if len(systems) < 6:
        print(f"FAIL: expected >=6 systems, got {len(systems)}")
        return 1

    failures = []
    strong_leading = 0
    for y, arr in systems:
        min_x = min(float(b["x"]) for b in arr)
        count = len(arr)
        # Strict Piano parity should keep leading boundaries near the left margin.
        if min_x <= 0.12:
            strong_leading += 1
        if min_x > 0.20:
            failures.append(f"system@{y}: min_x={min_x:.3f} > 0.20")
        if count < 3:
            failures.append(f"system@{y}: too few measures ({count})")

    if strong_leading < max(4, len(systems) - 2):
        failures.append(
            f"insufficient left-anchored systems: {strong_leading}/{len(systems)} systems have min_x <= 0.12"
        )

    if failures:
        print("FAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"PASS: systems={len(systems)}, measures={len(boxes)}")
    for y, arr in systems:
        min_x = min(float(b["x"]) for b in arr)
        print(f"  system@{y}: count={len(arr)} min_x={min_x:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
