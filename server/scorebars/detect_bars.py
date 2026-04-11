#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from typing import Dict, List

import cv2
import numpy as np


@dataclass(slots=True)
class Config:
    deskew_enabled: bool = True
    max_deskew_degrees: float = 3.5
    min_deskew_degrees: float = 0.08
    staff_detect_kernel_frac: float = 0.15
    staff_row_threshold_ratio: float = 0.27
    staff_row_fallback_ratio: float = 0.16
    line_run_join_px: int = 5
    stave_split_gap_multiplier: float = 2.8
    min_staff_lines: int = 4
    min_staff_span_multiplier: float = 2.7
    max_staff_lines_per_group: int = 8
    staff_group_split_gap_multiplier: float = 1.9
    system_margin_multiplier: float = 1.2
    system_gap_multiplier: float = 6.5
    system_gap_dynamic_multiplier: float = 1.45
    hard_system_gap_multiplier: float = 9.0
    system_gap_ink_ratio: float = 0.03
    forced_split_gap_multiplier: float = 2.4
    max_system_height_multiplier: float = 18.0
    left_brace_region_frac: float = 0.12
    brace_min_height_multiplier: float = 3.5
    brace_column_ratio: float = 0.32
    remove_staff_kernel_frac: float = 0.30
    barline_close_multiplier: float = 0.45
    barline_min_system_height_frac: float = 0.50
    barline_col_peak_ratio: float = 0.40
    cluster_multiplier: float = 0.60
    min_bar_spacing_multiplier: float = 2.2
    min_bar_spacing_page_frac: float = 0.028
    left_ignore_frac: float = 0.008
    min_staff_cross_ratio: float = 0.5
    fallback_component_height_multiplier: float = 2.6
    fallback_component_width_multiplier: float = 0.9
    min_measure_width_frac: float = 0.015


CFG = Config()


@dataclass(slots=True)
class StaffBand:
    y0: int
    y1: int
    line_centers: list[int] = field(default_factory=list)
    brace_hint: bool = False


@dataclass(slots=True)
class SystemDetection:
    system_index: int
    bbox: list[int]  # [x0, y0, x1, y1] inclusive
    staff_bboxes: list[list[int]]
    brace_hint: bool
    barlines_x: list[int] = field(default_factory=list)
    quality: dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class PageDetection:
    page_index: int
    width: int
    height: int
    deskew_angle_deg: float
    systems: list[SystemDetection] = field(default_factory=list)


def binarize_page(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return binary


def estimate_skew_angle(binary: np.ndarray, config: Config) -> float:
    edges = cv2.Canny(binary, 40, 120)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180.0,
        threshold=80,
        minLineLength=max(30, int(binary.shape[1] * 0.12)),
        maxLineGap=20,
    )
    if lines is None:
        return 0.0

    angles: list[float] = []
    weights: list[float] = []
    for seg in lines[:, 0]:
        x1, y1, x2, y2 = [int(v) for v in seg]
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            continue
        angle = math.degrees(math.atan2(dy, dx))
        while angle <= -90.0:
            angle += 180.0
        while angle > 90.0:
            angle -= 180.0
        if abs(angle) > 20.0:
            continue
        length = math.hypot(dx, dy)
        angles.append(angle)
        weights.append(length)
    if not angles:
        return 0.0
    weighted = float(np.average(np.array(angles), weights=np.array(weights)))
    if abs(weighted) < config.min_deskew_degrees:
        return 0.0
    return float(np.clip(weighted, -config.max_deskew_degrees, config.max_deskew_degrees))


def rotate_image_keep_bounds(image: np.ndarray, angle_deg: float, background: int = 255) -> np.ndarray:
    if abs(angle_deg) < 1e-6:
        return image
    h, w = image.shape[:2]
    center = (w / 2.0, h / 2.0)
    m = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos_v = abs(m[0, 0])
    sin_v = abs(m[0, 1])
    new_w = int((h * sin_v) + (w * cos_v))
    new_h = int((h * cos_v) + (w * sin_v))
    m[0, 2] += (new_w / 2) - center[0]
    m[1, 2] += (new_h / 2) - center[1]
    border_value = (background, background, background) if image.ndim == 3 else background
    return cv2.warpAffine(
        image,
        m,
        (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border_value,
    )


def preprocess_page(image_bgr: np.ndarray, config: Config) -> tuple[np.ndarray, np.ndarray, float]:
    binary = binarize_page(image_bgr)
    angle = estimate_skew_angle(binary, config) if config.deskew_enabled else 0.0
    if angle == 0.0:
        return image_bgr, binary, 0.0
    corrected_bgr = rotate_image_keep_bounds(image_bgr, -angle, background=255)
    corrected_binary = binarize_page(corrected_bgr)
    return corrected_bgr, corrected_binary, angle


def _detect_rows(binary: np.ndarray, kernel_len: int, threshold: float) -> np.ndarray:
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_len, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_lines.sum(axis=1).astype(float) / 255.0
    return np.where(row_sums >= threshold)[0]


def _cluster_rows(rows: np.ndarray, join_px: int) -> list[int]:
    if len(rows) == 0:
        return []
    centers: list[int] = []
    run_start = int(rows[0])
    for i in range(1, len(rows)):
        if int(rows[i]) - int(rows[i - 1]) > join_px:
            centers.append((run_start + int(rows[i - 1])) // 2)
            run_start = int(rows[i])
    centers.append((run_start + int(rows[-1])) // 2)
    return centers


def estimate_staff_spacing(line_centers: list[int]) -> float:
    if len(line_centers) < 2:
        return 12.0
    gaps = sorted(line_centers[i + 1] - line_centers[i] for i in range(len(line_centers) - 1))
    lower = gaps[: max(1, len(gaps) // 3)]
    return float(max(8.0, np.median(lower)))


def detect_staff_line_centers(binary: np.ndarray, config: Config) -> list[int]:
    _, w = binary.shape
    detect_len = max(10, int(w * config.staff_detect_kernel_frac))
    primary_threshold = max(10.0, w * config.staff_row_threshold_ratio)
    rows = _detect_rows(binary, detect_len, primary_threshold)

    if len(rows) < 12:
        fallback_len = max(8, int(detect_len * 0.7))
        fallback_threshold = max(8.0, w * config.staff_row_fallback_ratio)
        rows_fb = _detect_rows(binary, fallback_len, fallback_threshold)
        rows = np.union1d(rows, rows_fb).astype(int)

    if len(rows) < 12:
        raw_row_sums = binary.sum(axis=1).astype(float) / 255.0
        smooth = cv2.GaussianBlur(raw_row_sums.reshape(-1, 1), (1, 9), 0).reshape(-1)
        nz = smooth[smooth > 0]
        if nz.size > 0:
            dyn = max(w * 0.08, float(np.percentile(nz, 90)))
            rows_proj = np.where(smooth >= dyn)[0]
            rows = np.union1d(rows, rows_proj).astype(int)

    if len(rows) == 0:
        return []
    return _cluster_rows(rows, config.line_run_join_px)


def split_into_staves(line_centers: list[int], config: Config) -> list[StaffBand]:
    if not line_centers:
        return []
    spacing = estimate_staff_spacing(line_centers)
    split_threshold = spacing * config.stave_split_gap_multiplier
    groups: list[list[int]] = []
    cur = [line_centers[0]]
    for prev, nxt in zip(line_centers[:-1], line_centers[1:]):
        if (nxt - prev) > split_threshold:
            groups.append(cur)
            cur = [nxt]
        else:
            cur.append(nxt)
    groups.append(cur)

    split_groups: list[list[int]] = []
    for g in groups:
        pending = [g]
        while pending:
            cur_group = pending.pop()
            if len(cur_group) <= config.max_staff_lines_per_group:
                split_groups.append(cur_group)
                continue
            gaps = [cur_group[i + 1] - cur_group[i] for i in range(len(cur_group) - 1)]
            if not gaps:
                split_groups.append(cur_group)
                continue
            max_gap = max(gaps)
            if max_gap < spacing * config.staff_group_split_gap_multiplier:
                split_groups.append(cur_group)
                continue
            split_i = gaps.index(max_gap) + 1
            left = cur_group[:split_i]
            right = cur_group[split_i:]
            if len(left) >= 2 and len(right) >= 2:
                pending.append(right)
                pending.append(left)
            else:
                split_groups.append(cur_group)
    groups = sorted(split_groups, key=lambda g: g[0])

    min_span = int(spacing * config.min_staff_span_multiplier)
    staves: list[StaffBand] = []
    trailing_sparse_group: list[int] | None = None
    for g in groups:
        if len(g) < config.min_staff_lines:
            trailing_sparse_group = list(g)
            continue
        y0 = int(g[0])
        y1 = int(g[-1])
        if (y1 - y0) < min_span:
            trailing_sparse_group = list(g)
            continue
        staves.append(StaffBand(y0=y0, y1=y1, line_centers=list(g)))
        trailing_sparse_group = None

    if trailing_sparse_group and staves:
        prev = staves[-1]
        gap = trailing_sparse_group[0] - prev.y1
        if spacing * 1.6 <= gap <= spacing * 10.0 and (len(staves) % 2 == 1):
            recent_spans = [s.y1 - s.y0 for s in staves[-3:]]
            est_span = int(np.median(recent_spans)) if recent_spans else int(spacing * 4.0)
            est_span = max(min_span, est_span)
            y0 = int(trailing_sparse_group[0])
            y1 = y0 + est_span
            inferred_lines = list(trailing_sparse_group)
            staves.append(StaffBand(y0=y0, y1=y1, line_centers=inferred_lines))
    return staves


def _staff_center(staff: StaffBand) -> int:
    return (staff.y0 + staff.y1) // 2


def _detect_brace_spans(binary: np.ndarray, spacing: float, config: Config) -> list[tuple[int, int, float]]:
    h, w = binary.shape
    x_right = max(10, int(w * config.left_brace_region_frac))
    region = binary[:, :x_right]
    min_height = max(12, int(spacing * config.brace_min_height_multiplier))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_height))
    v_open = cv2.morphologyEx(region, cv2.MORPH_OPEN, v_kernel)
    if not np.any(v_open):
        return []

    col_strength = v_open.sum(axis=0).astype(float)
    max_strength = float(np.max(col_strength)) if col_strength.size else 0.0
    if max_strength <= 0.0:
        return []
    col_cut = max(1.0, max_strength * 0.45)
    good_cols = np.where(col_strength >= col_cut)[0]
    if len(good_cols) == 0:
        return []

    col0 = int(np.min(good_cols))
    col1 = int(np.max(good_cols)) + 1
    mask = v_open[:, col0:col1]
    row_on = (mask.sum(axis=1) > 0).astype(np.uint8)

    spans: list[tuple[int, int, float]] = []
    y = 0
    while y < h:
        if row_on[y] == 0:
            y += 1
            continue
        start = y
        while y < h and row_on[y] == 1:
            y += 1
        end = y - 1
        span_h = end - start + 1
        if span_h < min_height:
            continue
        span_mask = mask[start : end + 1, :]
        continuity = float(np.count_nonzero(span_mask) / span_mask.size)
        height_score = min(1.0, span_h / max(1.0, spacing * 9.0))
        conf = 0.55 * height_score + 0.45 * min(1.0, continuity / 0.25)
        spans.append((start, end, float(np.clip(conf, 0.0, 1.0))))
    return spans


def _consolidate_brace_spans(spans: list[tuple[int, int, float]], spacing: float) -> list[tuple[int, int, float]]:
    if not spans:
        return []
    spans = sorted(spans, key=lambda s: s[0])
    out: list[tuple[int, int, float]] = []
    gap_limit = int(max(6.0, spacing * 1.2))
    max_combined_h = int(max(40.0, spacing * 24.0))
    cur_y0, cur_y1, cur_conf = spans[0]
    for y0, y1, conf in spans[1:]:
        gap = y0 - cur_y1
        combined_h = max(cur_y1, y1) - min(cur_y0, y0) + 1
        if gap <= gap_limit and combined_h <= max_combined_h:
            h_a = max(1, cur_y1 - cur_y0 + 1)
            h_b = max(1, y1 - y0 + 1)
            cur_conf = float((cur_conf * h_a + conf * h_b) / (h_a + h_b))
            cur_y0 = min(cur_y0, y0)
            cur_y1 = max(cur_y1, y1)
        else:
            out.append((cur_y0, cur_y1, cur_conf))
            cur_y0, cur_y1, cur_conf = y0, y1, conf
    out.append((cur_y0, cur_y1, cur_conf))
    return out


def _pair_staves_into_systems(staves: list[StaffBand], h: int, w: int, spacing: float, config: Config) -> list[SystemDetection]:
    systems: list[SystemDetection] = []
    margin = int(max(8.0, spacing * config.system_margin_multiplier))
    i = 0
    while i < len(staves):
        a = staves[i]
        if i + 1 < len(staves):
            b = staves[i + 1]
            system_staves = [a, b]
            i += 2
        else:
            system_staves = [a]
            i += 1
        ys0 = min(s.y0 for s in system_staves)
        ys1 = max(s.y1 for s in system_staves)
        bbox = [0, max(0, ys0 - margin), w - 1, min(h - 1, ys1 + margin)]
        staff_boxes = [[0, s.y0, w - 1, s.y1] for s in system_staves]
        systems.append(
            SystemDetection(
                system_index=len(systems),
                bbox=bbox,
                staff_bboxes=staff_boxes,
                brace_hint=any(s.brace_hint for s in system_staves),
                quality={"paired_fallback": 1.0, "staff_count": float(len(system_staves))},
            )
        )
    return systems


def detect_brace_hints(binary: np.ndarray, staves: list[StaffBand], spacing: float, config: Config) -> None:
    if not staves:
        return
    spans = _detect_brace_spans(binary, spacing, config)
    if not spans:
        return
    for staff in staves:
        cy = _staff_center(staff)
        for y0, y1, conf in spans:
            if conf < 0.45:
                continue
            if y0 - int(spacing) <= cy <= y1 + int(spacing):
                staff.brace_hint = True
                break


def _ink_ratio_between(binary: np.ndarray, y0: int, y1: int) -> float:
    if y1 <= y0:
        return 0.0
    h, w = binary.shape
    x0 = max(0, int(0.20 * w))
    x1 = min(w, int(0.92 * w))
    if x1 <= x0:
        x0, x1 = 0, w
    region = binary[y0:y1, x0:x1]
    if region.size == 0:
        return 0.0
    return float(np.count_nonzero(region) / region.size)


def group_staves_into_systems(binary: np.ndarray, staves: list[StaffBand], spacing: float, config: Config) -> list[SystemDetection]:
    if not staves:
        return []
    h, w = binary.shape
    staves = sorted(staves, key=lambda s: s.y0)
    staff_centers = [_staff_center(s) for s in staves]
    median_staff_h = int(np.median([max(8, s.y1 - s.y0) for s in staves])) if staves else max(8, int(spacing * 4.0))

    raw_spans = _detect_brace_spans(binary, spacing, config)
    confident_spans = [s for s in raw_spans if s[2] >= 0.55]
    brace_spans = _consolidate_brace_spans(confident_spans, spacing)
    assigned = [False] * len(staves)

    center_deltas: list[int] = []
    span_members: list[tuple[int, int, float, list[int], int]] = []
    for span_id, (y0, y1, conf) in enumerate(brace_spans):
        idxs = [i for i, cy in enumerate(staff_centers) if (y0 - int(spacing * 0.5) <= cy <= y1 + int(spacing * 0.5))]
        if 2 <= len(idxs) <= 3:
            top_i, bot_i = idxs[0], idxs[-1]
            center_deltas.append(abs(staff_centers[bot_i] - staff_centers[top_i]))
        span_members.append((y0, y1, conf, idxs, span_id))
    expected_center_delta = int(np.median(center_deltas)) if center_deltas else int(max(spacing * 9.0, median_staff_h * 2.8))
    expected_center_delta = max(int(spacing * 6.0), expected_center_delta)

    systems: list[SystemDetection] = []
    margin = int(max(8.0, spacing * config.system_margin_multiplier))

    for y0, y1, conf, idxs, span_id in sorted(span_members, key=lambda t: t[0]):
        span_h = y1 - y0 + 1
        if span_h < int(spacing * 6.0):
            continue
        for i in idxs:
            assigned[i] = True

        staff_group = [staves[i] for i in idxs]
        staff_boxes: list[list[int]] = [[0, s.y0, w - 1, s.y1] for s in staff_group]
        inferred_staff = 0

        if len(staff_boxes) == 1:
            only = staff_group[0]
            c = _staff_center(only)
            target_down = c + expected_center_delta
            target_up = c - expected_center_delta
            dist_down = abs((y1 - median_staff_h // 2) - target_down)
            dist_up = abs((y0 + median_staff_h // 2) - target_up)
            if dist_down <= dist_up:
                synth_center = min(y1 - median_staff_h // 2, target_down)
            else:
                synth_center = max(y0 + median_staff_h // 2, target_up)
            sy0 = int(max(0, synth_center - median_staff_h // 2))
            sy1 = int(min(h - 1, sy0 + median_staff_h))
            if sy1 - sy0 < 8:
                sy1 = min(h - 1, sy0 + max(8, median_staff_h))
            staff_boxes.append([0, sy0, w - 1, sy1])
            inferred_staff = 1
        elif len(staff_boxes) == 0:
            if conf < 0.70 or span_h > int(spacing * 24.0):
                continue
            center_mid = (y0 + y1) // 2
            c_top = max(y0 + median_staff_h // 2, center_mid - expected_center_delta // 2)
            c_bot = min(y1 - median_staff_h // 2, c_top + expected_center_delta)
            t0 = int(max(0, c_top - median_staff_h // 2))
            t1 = int(min(h - 1, t0 + median_staff_h))
            b0 = int(max(0, c_bot - median_staff_h // 2))
            b1 = int(min(h - 1, b0 + median_staff_h))
            if b0 <= t1:
                b0 = min(h - 2, t1 + int(max(6, spacing * 1.8)))
                b1 = min(h - 1, b0 + median_staff_h)
            if t1 - t0 >= 8 and b1 - b0 >= 8:
                staff_boxes = [[0, t0, w - 1, t1], [0, b0, w - 1, b1]]
                inferred_staff = 2
            else:
                continue

        ys0 = min(bb[1] for bb in staff_boxes)
        ys1 = max(bb[3] for bb in staff_boxes)
        ys0 = max(ys0, y0 - int(spacing * 0.6))
        ys1 = min(ys1, y1 + int(spacing * 0.6))
        brace_conf = float(conf)
        brace_lock = 1.0 if (len(idxs) >= 2 and inferred_staff == 0 and brace_conf >= 0.60) else 0.0
        systems.append(
            SystemDetection(
                system_index=len(systems),
                bbox=[0, max(0, int(ys0) - margin), w - 1, min(h - 1, int(ys1) + margin)],
                staff_bboxes=staff_boxes,
                brace_hint=True,
                quality={
                    "source_brace": 1.0,
                    "brace_confidence": brace_conf,
                    "brace_span_id": float(span_id),
                    "brace_lock": brace_lock,
                    "inferred_staff_count": float(inferred_staff),
                    "staff_count": float(len(staff_boxes)),
                },
            )
        )

    unassigned = [i for i, flag in enumerate(assigned) if not flag]
    if systems and unassigned:
        for i in list(unassigned):
            cy = staff_centers[i]
            best_sys = None
            best_d = 10**9
            for si, sys in enumerate(systems):
                sy0, sy1 = int(sys.bbox[1]), int(sys.bbox[3])
                if sy0 <= cy <= sy1:
                    best_sys = si
                    best_d = 0
                    break
                d = min(abs(cy - sy0), abs(cy - sy1))
                if d < best_d:
                    best_d = d
                    best_sys = si
            if best_sys is not None and best_d <= int(spacing * 7.5):
                s = staves[i]
                systems[best_sys].staff_bboxes.append([0, s.y0, w - 1, s.y1])
                systems[best_sys].bbox[1] = min(int(systems[best_sys].bbox[1]), max(0, s.y0 - margin))
                systems[best_sys].bbox[3] = max(int(systems[best_sys].bbox[3]), min(h - 1, s.y1 + margin))
                q = systems[best_sys].quality
                q["source_neighbor"] = q.get("source_neighbor", 0.0) + 1.0
                assigned[i] = True
                unassigned.remove(i)

    residual_staves = [staves[i] for i, flag in enumerate(assigned) if not flag]
    gaps = [max(0, residual_staves[i + 1].y0 - residual_staves[i].y1) for i in range(len(residual_staves) - 1)]
    if gaps:
        sorted_gaps = sorted(gaps)
        lower = sorted_gaps[: max(1, len(sorted_gaps) // 2)]
        typical_gap = float(np.median(lower))
    else:
        typical_gap = spacing * 4.0
    median_gap = float(np.median(gaps)) if gaps else typical_gap
    dynamic_break = max(spacing * config.system_gap_multiplier, typical_gap * config.system_gap_dynamic_multiplier)
    hard_break = spacing * config.hard_system_gap_multiplier

    groups: list[list[StaffBand]] = []
    current = [residual_staves[0]] if residual_staves else []
    for i, nxt in enumerate(residual_staves[1:]):
        prev = residual_staves[i]
        gap = max(0, nxt.y0 - prev.y1)
        ink_ratio = _ink_ratio_between(binary, prev.y1, nxt.y0)
        is_break = gap > dynamic_break and (ink_ratio < config.system_gap_ink_ratio or gap > hard_break)
        if is_break and not (prev.brace_hint and nxt.brace_hint and gap < hard_break):
            groups.append(current)
            current = [nxt]
        else:
            current.append(nxt)
    if current:
        groups.append(current)

    max_group_height = spacing * config.max_system_height_multiplier
    refined_groups: list[list[StaffBand]] = []
    for group in groups:
        if len(group) < 3:
            refined_groups.append(group)
            continue
        group_height = group[-1].y1 - group[0].y0
        if group_height <= max_group_height:
            refined_groups.append(group)
            continue

        inner_gaps = [max(0, group[i + 1].y0 - group[i].y1) for i in range(len(group) - 1)]
        if not inner_gaps:
            refined_groups.append(group)
            continue
        small_half = sorted(inner_gaps)[: max(1, len(inner_gaps) // 2)]
        typical = max(spacing * 2.0, float(np.median(small_half)))
        break_threshold = typical * config.forced_split_gap_multiplier

        part: list[StaffBand] = [group[0]]
        for i, st in enumerate(group[1:]):
            g = inner_gaps[i]
            if g >= break_threshold and len(part) >= 1:
                refined_groups.append(part)
                part = [st]
            else:
                part.append(st)
        refined_groups.append(part)
    groups = refined_groups

    for staff_group in groups:
        ys0 = min(s.y0 for s in staff_group)
        ys1 = max(s.y1 for s in staff_group)
        bbox = [0, max(0, ys0 - margin), w - 1, min(h - 1, ys1 + margin)]
        staff_boxes = [[0, s.y0, w - 1, s.y1] for s in staff_group]
        systems.append(
            SystemDetection(
                system_index=len(systems),
                bbox=bbox,
                staff_bboxes=staff_boxes,
                brace_hint=any(s.brace_hint for s in staff_group),
                quality={
                    "source_heuristic": 1.0,
                    "staff_count": float(len(staff_group)),
                    "median_gap": median_gap,
                },
            )
        )

    if len(systems) > 1:
        systems = sorted(systems, key=lambda s: int(s.bbox[1]))
        merged_systems: list[SystemDetection] = []
        for sys in systems:
            if merged_systems:
                prev = merged_systems[-1]
                prev_q = prev.quality
                cur_q = sys.quality
                same_span = (
                    prev_q.get("source_brace", 0.0) >= 1.0
                    and cur_q.get("source_brace", 0.0) >= 1.0
                    and int(prev_q.get("brace_span_id", -1.0)) == int(cur_q.get("brace_span_id", -2.0))
                )
                if same_span:
                    prev.bbox = [0, min(int(prev.bbox[1]), int(sys.bbox[1])), w - 1, max(int(prev.bbox[3]), int(sys.bbox[3]))]
                    prev.staff_bboxes = sorted(prev.staff_bboxes + sys.staff_bboxes, key=lambda bb: bb[1])
                    prev.quality["inferred_staff_count"] = prev_q.get("inferred_staff_count", 0.0) + cur_q.get(
                        "inferred_staff_count", 0.0
                    )
                    prev.quality["staff_count"] = prev_q.get("staff_count", 0.0) + cur_q.get("staff_count", 0.0)
                    prev.quality["brace_span_merge"] = 1.0
                    prev.quality["brace_lock"] = min(prev_q.get("brace_lock", 0.0), cur_q.get("brace_lock", 0.0))
                    continue
            merged_systems.append(sys)
        systems = merged_systems

    min_expected = max(1, len(staves) // 2)
    if len(staves) >= 4 and len(systems) < min_expected:
        systems = _pair_staves_into_systems(staves, h, w, spacing, config)

    for i, sys_det in enumerate(systems):
        sys_det.system_index = i
        sys_det.staff_bboxes = sorted(sys_det.staff_bboxes, key=lambda bb: bb[1])
    return systems


def _cluster_columns(cols: np.ndarray, max_gap: int) -> list[int]:
    if len(cols) == 0:
        return []
    clustered: list[int] = []
    group = [int(cols[0])]
    for c in cols[1:]:
        if int(c) - group[-1] <= max_gap:
            group.append(int(c))
        else:
            clustered.append(int(np.mean(group)))
            group = [int(c)]
    clustered.append(int(np.mean(group)))
    return clustered


def _component_candidates(binary_region: np.ndarray, spacing: float, min_len: int, config: Config) -> list[int]:
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(binary_region, connectivity=8)
    xs: list[int] = []
    max_w = max(3, int(spacing * config.fallback_component_width_multiplier))
    min_h = max(int(spacing * config.fallback_component_height_multiplier), int(min_len * 0.6))
    for i in range(1, n_labels):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if w <= 0 or h <= 0:
            continue
        if h < min_h or w > max_w:
            continue
        if area < max(12, h):
            continue
        if (h / max(1, w)) < 3.0:
            continue
        xs.append(int(x + w // 2))
    return xs


def detect_system_barlines(binary: np.ndarray, system: SystemDetection, spacing: float, config: Config) -> list[int]:
    h, w = binary.shape
    _, y0, _, y1 = system.bbox
    y0 = max(0, min(y0, h - 1))
    y1 = max(y0 + 1, min(y1, h))
    system_h = y1 - y0
    region = binary[y0:y1, :]

    remove_len = max(10, int(w * config.remove_staff_kernel_frac))
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (remove_len, 1))
    staff_mask = cv2.morphologyEx(region, cv2.MORPH_OPEN, h_kernel)
    no_staff = cv2.subtract(region, staff_mask)

    close_h = max(3, int(spacing * config.barline_close_multiplier))
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, close_h))
    closed = cv2.morphologyEx(no_staff, cv2.MORPH_CLOSE, close_kernel)

    min_len = max(5, int(system_h * config.barline_min_system_height_frac), int(spacing * 4.0))
    v_open = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_len))
    v_lines = cv2.morphologyEx(closed, cv2.MORPH_OPEN, v_open, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    col_sums = v_lines.sum(axis=0).astype(float)
    cluster_px = max(2, int(spacing * config.cluster_multiplier))
    candidates: list[int] = []
    if col_sums.size > 0 and np.max(col_sums) > 0:
        threshold = float(np.max(col_sums) * config.barline_col_peak_ratio)
        cols = np.where(col_sums >= threshold)[0]
        if len(cols) > 0:
            candidates.extend(_cluster_columns(cols, cluster_px))
    else:
        threshold = 0.0

    if len(candidates) < 2:
        candidates.extend(_component_candidates(closed, spacing, min_len, config))
        candidates = sorted(set(candidates))
        if len(candidates) > 1:
            candidates = _cluster_columns(np.array(candidates), cluster_px)
        elif not candidates:
            return []

    left_ignore = int(w * config.left_ignore_frac)
    min_cross = max(1, int(len(system.staff_bboxes) * config.min_staff_cross_ratio))
    vetted: list[int] = []
    for x in candidates:
        if x <= left_ignore or x >= (w - 1):
            continue
        crossings = 0
        for _, sy0, _, sy1 in system.staff_bboxes:
            a = max(y0, sy0)
            b = min(y1, sy1 + 1)
            if b <= a:
                continue
            col = closed[(a - y0):(b - y0), max(0, x - 1):min(w, x + 2)]
            if np.count_nonzero(col) > 0:
                crossings += 1
        if crossings >= min_cross:
            vetted.append(int(x))

    if len(vetted) < 2:
        return sorted(set(vetted))

    min_spacing = max(int(spacing * config.min_bar_spacing_multiplier), int(w * config.min_bar_spacing_page_frac), 12)
    filtered = [vetted[0]]
    for x in vetted[1:]:
        if x - filtered[-1] >= min_spacing:
            filtered.append(x)

    # Conservative right-edge recovery for terminal barlines that can be dropped by
    # clustering/spacing filters on dense pages. We only append when there is clear
    # vertical evidence near the right margin and spacing remains plausible.
    if filtered and col_sums.size > 0 and float(np.max(col_sums)) > 0:
        right_probe_start = max(filtered[-1] + int(0.7 * min_spacing), int(w * 0.86))
        right_probe_end = min(w - 1, int(w * 0.995))
        if right_probe_end > right_probe_start + 2:
            seg = col_sums[right_probe_start:right_probe_end]
            if seg.size > 0 and float(np.max(seg)) > 0:
                probe_thresh = max(float(np.max(col_sums) * 0.45), float(np.percentile(seg, 92)))
                right_cols = np.where(seg >= probe_thresh)[0]
                if right_cols.size > 0:
                    clustered = _cluster_columns(right_cols + right_probe_start, max(2, cluster_px))
                    candidate = max(clustered)
                    if candidate < (w - 1) and (candidate - filtered[-1]) >= int(0.7 * min_spacing):
                        filtered.append(int(candidate))

    # Final fallback for missing terminal system line: check the extreme right tail.
    if filtered and filtered[-1] < int(w * 0.90) and col_sums.size > 0 and float(np.max(col_sums)) > 0:
        tail_start = int(w * 0.90)
        tail_end = min(w - 1, int(w * 0.998))
        if tail_end > tail_start + 2:
            tail = col_sums[tail_start:tail_end]
            if tail.size > 0 and float(np.max(tail)) > 0:
                tail_thresh = max(float(np.max(col_sums) * 0.30), float(np.percentile(tail, 88)))
                tail_cols = np.where(tail >= tail_thresh)[0]
                if tail_cols.size > 0:
                    clustered_tail = _cluster_columns(tail_cols + tail_start, max(2, cluster_px))
                    candidate = max(clustered_tail)
                    if candidate < (w - 1) and (candidate - filtered[-1]) >= int(0.55 * min_spacing):
                        filtered.append(int(candidate))
    return filtered


def _split_tallest_system(page: PageDetection) -> bool:
    if not page.systems:
        return False
    splittable = [
        i
        for i, s in enumerate(page.systems)
        if not (s.quality.get("brace_lock", 0.0) >= 1.0 or (s.quality.get("source_brace", 0.0) >= 1.0 and len(s.staff_bboxes) == 2))
    ]
    if not splittable:
        return False
    idx = max(splittable, key=lambda i: page.systems[i].bbox[3] - page.systems[i].bbox[1])
    target = page.systems[idx]
    if len(target.staff_bboxes) < 2:
        return False
    x0, y0, x1, y1 = [int(v) for v in target.bbox]
    if (y1 - y0) < 40:
        return False
    split_y = (y0 + y1) // 2
    top_staff = [b for b in target.staff_bboxes if ((b[1] + b[3]) // 2) <= split_y]
    bot_staff = [b for b in target.staff_bboxes if ((b[1] + b[3]) // 2) > split_y]
    if not top_staff or not bot_staff:
        half = max(1, len(target.staff_bboxes) // 2)
        top_staff = target.staff_bboxes[:half] or [[x0, y0, x1, split_y]]
        bot_staff = target.staff_bboxes[half:] or [[x0, split_y + 1, x1, y1]]

    a = SystemDetection(
        system_index=idx,
        bbox=[x0, y0, x1, split_y],
        staff_bboxes=top_staff,
        brace_hint=target.brace_hint,
        barlines_x=[],
        quality={**target.quality, "normalized_split": 1.0},
    )
    b = SystemDetection(
        system_index=idx + 1,
        bbox=[x0, split_y + 1, x1, y1],
        staff_bboxes=bot_staff,
        brace_hint=target.brace_hint,
        barlines_x=[],
        quality={**target.quality, "normalized_split": 1.0},
    )
    page.systems[idx:idx + 1] = [a, b]
    for i, s in enumerate(page.systems):
        s.system_index = i
    return True


def _merge_closest_systems(page: PageDetection) -> bool:
    if len(page.systems) < 2:
        return False
    best_i = None
    best_gap = 10**9
    for i in range(len(page.systems) - 1):
        if page.systems[i].quality.get("brace_lock", 0.0) >= 1.0:
            continue
        if page.systems[i + 1].quality.get("brace_lock", 0.0) >= 1.0:
            continue
        gap = int(page.systems[i + 1].bbox[1]) - int(page.systems[i].bbox[3])
        if gap < best_gap:
            best_gap = gap
            best_i = i
    if best_i is None:
        return False
    a = page.systems[best_i]
    b = page.systems[best_i + 1]
    merged = SystemDetection(
        system_index=best_i,
        bbox=[0, min(a.bbox[1], b.bbox[1]), page.width - 1, max(a.bbox[3], b.bbox[3])],
        staff_bboxes=sorted(a.staff_bboxes + b.staff_bboxes, key=lambda bb: bb[1]),
        brace_hint=a.brace_hint or b.brace_hint,
        barlines_x=[],
        quality={"normalized_merge": 1.0},
    )
    page.systems[best_i:best_i + 2] = [merged]
    for i, s in enumerate(page.systems):
        s.system_index = i
    return True


def _normalize_system_counts(detections: list[PageDetection]) -> None:
    if len(detections) < 6:
        return
    middle_counts = [len(p.systems) for i, p in enumerate(detections) if 1 <= i <= len(detections) - 3]
    if not middle_counts:
        return
    target = max(set(middle_counts), key=middle_counts.count)
    if target < 3:
        return
    for i, page in enumerate(detections):
        if i == 0 or i >= len(detections) - 2:
            continue
        while len(page.systems) < target:
            if not _split_tallest_system(page):
                break
        while len(page.systems) > target:
            if not _merge_closest_systems(page):
                break


def barlines_to_boxes(page: PageDetection) -> list[dict]:
    h = page.height
    w = page.width
    boxes: list[dict] = []
    for system in page.systems:
        xs = sorted(set(int(x) for x in system.barlines_x))
        if len(xs) < 2:
            continue
        y_top = system.bbox[1] / h
        y_bot = (system.bbox[3] + 1) / h
        hh = y_bot - y_top
        for i in range(len(xs) - 1):
            left = xs[i] / w
            right = xs[i + 1] / w
            ww = right - left
            if ww >= CFG.min_measure_width_frac:
                boxes.append({"x": left, "y": y_top, "w": ww, "h": hh})
    return boxes


def _detect_pages(paths: list[str]) -> list[PageDetection]:
    detections: list[PageDetection] = []
    binaries: list[np.ndarray] = []
    page_spacings: list[float] = []

    for i, image_path in enumerate(paths):
        image_bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if image_bgr is None:
            raise RuntimeError(f"Could not read image: {image_path}")
        corrected_bgr, binary, angle = preprocess_page(image_bgr, CFG)
        h, w = corrected_bgr.shape[:2]
        line_centers = detect_staff_line_centers(binary, CFG)
        spacing = estimate_staff_spacing(line_centers)
        staves = split_into_staves(line_centers, CFG)
        detect_brace_hints(binary, staves, spacing, CFG)
        systems = group_staves_into_systems(binary, staves, spacing, CFG)
        detections.append(PageDetection(page_index=i, width=w, height=h, deskew_angle_deg=angle, systems=systems))
        binaries.append(binary)
        page_spacings.append(float(spacing))

    _normalize_system_counts(detections)

    for i, page in enumerate(detections):
        binary = binaries[i]
        spacing = page_spacings[i]
        for system in page.systems:
            system.barlines_x = detect_system_barlines(binary, system, spacing, CFG)

    return detections


def detect_bars(image_path: str) -> list[dict]:
    pages = _detect_pages([image_path])
    return barlines_to_boxes(pages[0]) if pages else []


def detect_bars_batch(paths: list[str]) -> dict[str, list[dict]]:
    pages = _detect_pages(paths)
    out: dict[str, list[dict]] = {}
    for i, path in enumerate(paths):
        out[path] = barlines_to_boxes(pages[i]) if i < len(pages) else []
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]), flush=True)
        sys.exit(0)
    try:
        if len(sys.argv) == 2:
            print(json.dumps(detect_bars(sys.argv[1])), flush=True)
        else:
            print(json.dumps(detect_bars_batch(sys.argv[1:])), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)
