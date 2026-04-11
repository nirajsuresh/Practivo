#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "test-fixtures"
SCRIPT = ROOT / "detect_bars.py"
LOCAL_VENV_PY = ROOT / ".venv" / "bin" / "python"
PYTHON = os.environ.get("SCOREBARS_PYTHON") or (str(LOCAL_VENV_PY) if LOCAL_VENV_PY.exists() else "python3")


CASES = [
    {
        "name": "ballade_dense_a",
        "file": "ballade_dense_a.png",
        "min_systems": 6,
        "max_systems": 7,
        "min_measures": 48,
        "max_measures": 62,
    },
    {
        "name": "ballade_dense_b",
        "file": "ballade_dense_b.png",
        "min_systems": 4,
        "max_systems": 6,
        "min_measures": 9,
        "max_measures": 18,
    },
    {
        "name": "single_staff_lead",
        "file": "single_staff_lead.png",
        "min_systems": 1,
        "max_systems": 1,
        "min_measures": 6,
        "max_measures": 20,
    },
    {
        "name": "grand_staff_sparse",
        "file": "grand_staff_sparse.png",
        "min_systems": 3,
        "max_systems": 5,
        "min_measures": 10,
        "max_measures": 34,
    },
]


def run_detector(image_path: Path) -> list[dict]:
    out = subprocess.check_output([PYTHON, str(SCRIPT), str(image_path)], text=True, cwd=str(ROOT))
    data = json.loads(out)
    if not isinstance(data, list):
        raise RuntimeError(f"Expected list output for single image, got: {type(data)}")
    return data


def cluster_systems(boxes: list[dict], y_tol: float = 0.045) -> list[list[dict]]:
    if not boxes:
        return []
    centers = [(b["y"] + b["h"] / 2.0, b) for b in boxes]
    centers.sort(key=lambda item: item[0])
    groups: list[list[dict]] = [[centers[0][1]]]
    anchor = centers[0][0]
    for cy, box in centers[1:]:
        if abs(cy - anchor) <= y_tol:
            groups[-1].append(box)
            ys = [x["y"] + x["h"] / 2.0 for x in groups[-1]]
            anchor = sum(ys) / len(ys)
        else:
            groups.append([box])
            anchor = cy
    return groups


def check_system_heights(groups: list[list[dict]], min_height: float = 0.085) -> tuple[bool, list[float]]:
    heights = []
    ok = True
    for g in groups:
        y0 = min(b["y"] for b in g)
        y1 = max(b["y"] + b["h"] for b in g)
        h = y1 - y0
        heights.append(h)
        if h < min_height:
            ok = False
    return ok, heights


def validate_case(case: dict) -> tuple[bool, str]:
    image_path = FIXTURES / case["file"]
    if not image_path.exists():
        return True, f"[SKIP] {case['name']}: missing fixture {image_path}"

    boxes = run_detector(image_path)
    n = len(boxes)
    if n < case["min_measures"] or n > case["max_measures"]:
        return False, f"[FAIL] {case['name']}: measures={n} not in [{case['min_measures']}, {case['max_measures']}]"

    groups = cluster_systems(boxes)
    if len(groups) < case["min_systems"] or len(groups) > case["max_systems"]:
        return False, f"[FAIL] {case['name']}: systems={len(groups)} not in [{case['min_systems']}, {case['max_systems']}]"

    heights_ok, heights = check_system_heights(groups)
    if not heights_ok:
        return False, f"[FAIL] {case['name']}: short system heights={['%.3f' % h for h in heights]}"

    return True, f"[PASS] {case['name']}: measures={n}, systems={len(groups)}"


def main() -> int:
    if not SCRIPT.exists():
        print(f"Detector script missing: {SCRIPT}")
        return 1

    failed = False
    for case in CASES:
        ok, msg = validate_case(case)
        print(msg)
        failed = failed or (not ok)

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
