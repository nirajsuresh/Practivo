// Dry-run smoke test of v2 scheduler: loads a real plan's sections and
// simulates the full horizon (segmentation + day-by-day composition) without
// writing to the DB. Verifies coverage constraints:
//  - Every non-ignored passage gets touched at least once.
//  - Every required phase for each passage gets at least one touch.

import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  segmentSectionsIntoPassages,
  synthesizeFullCoverageSections,
  composeSession,
  type PassageWithState,
} from "../scheduler";
import type { Passage, PassageProgress, LearningPlan, PlayingLevel, PhaseType, SessionSection } from "@shared/schema";
import { PHASE_TYPES } from "@shared/schema";

const PHASE_TOUCHES_BY_BUCKET: Record<string, Record<PhaseType, number>> = {
  gap:    { decode: 1, build: 0, connect: 0, shape: 1, perform: 1 },
  easy:   { decode: 1, build: 1, connect: 0, shape: 1, perform: 1 },
  medium: { decode: 2, build: 2, connect: 1, shape: 1, perform: 1 },
  hard:   { decode: 2, build: 4, connect: 1, shape: 1, perform: 1 },
};
const bucket = (d: number, sectionId: number | null) =>
  sectionId === null || sectionId <= 0 ? "gap" : d <= 3 ? "easy" : d <= 7 ? "medium" : "hard";
const requiredTouches = (d: number, sectionId: number | null, p: PhaseType) =>
  PHASE_TOUCHES_BY_BUCKET[bucket(d, sectionId)][p];
const advancePhase = (p: PhaseType): PhaseType => {
  const i = PHASE_TYPES.indexOf(p);
  return i < 0 || i >= PHASE_TYPES.length - 1 ? p : PHASE_TYPES[i + 1];
};
const nextRequiredPhase = (p: PhaseType, d: number, sectionId: number | null): PhaseType => {
  let cur = p;
  while (requiredTouches(d, sectionId, cur) === 0) {
    const nxt = advancePhase(cur);
    if (nxt === cur) return cur;
    cur = nxt;
  }
  return cur;
};

async function main() {
  const targetPlanId = Number(process.argv[2] ?? 20);
  const plan = (await db.execute(sql`SELECT * FROM learning_plans WHERE id = ${targetPlanId}`)).rows[0] as any;
  if (!plan) throw new Error(`plan ${targetPlanId} not found`);

  const sections = (await db.execute(sql`
    SELECT id, name, measure_start, measure_end, difficulty, ignored, display_order
    FROM plan_sections WHERE learning_plan_id = ${targetPlanId} ORDER BY display_order
  `)).rows as any[];

  const dailyMinutes = plan.daily_practice_minutes ?? 30;
  const level: PlayingLevel = "intermediate";
  const userSections = sections.map((s) => ({
    id: s.id,
    name: s.name,
    measureStart: s.measure_start,
    measureEnd: s.measure_end,
    difficulty: s.difficulty,
    ignored: s.ignored,
    displayOrder: s.display_order,
  }));
  const fullCoverage = synthesizeFullCoverageSections(userSections, plan.total_measures ?? 0);
  const syntheticCount = fullCoverage.filter((s) => s.id < 0).length;
  console.log(`Full-coverage sections: ${fullCoverage.length} (${userSections.filter((s) => !s.ignored).length} user-marked + ${syntheticCount} synthesized gaps)`);
  const passagePlans = segmentSectionsIntoPassages(fullCoverage, level);

  console.log(`\n== Plan ${plan.id} — ${sections.filter((s) => !s.ignored).length} active sections, ${passagePlans.length} passages, ${dailyMinutes}m/day ==\n`);

  // Build simulated pool with passages fresh (not yet introduced, all in orient).
  const now = new Date();
  const pool: PassageWithState[] = passagePlans.map((pp, i) => {
    const passage: Passage = {
      id: 10000 + i,
      learningPlanId: plan.id,
      sectionId: pp.sectionId,
      kind: pp.kind,
      label: pp.label,
      measureStart: pp.measureStart,
      measureEnd: pp.measureEnd,
      difficulty: pp.difficulty,
      challenges: pp.challenges,
      displayOrder: pp.displayOrder,
      createdAt: now,
    };
    const progress: PassageProgress = {
      id: 20000 + i,
      passageId: passage.id,
      learningPlanId: plan.id,
      userId: plan.user_id,
      currentPhase: nextRequiredPhase("decode", pp.difficulty, pp.sectionId),
      phaseStartedAt: null,
      phaseTouchCount: 0,
      maturity: 0,
      srStability: 1,
      srDifficulty: pp.difficulty,
      lastReviewedAt: null,
      nextDueAt: null,
      reviewCount: 0,
      lapseCount: 0,
      outstandingChallenges: pp.challenges,
      lastFlagCount: 0,
      introducedAt: null,
      retiredAt: null,
      dailyMaintenanceFlag: false,
      updatedAt: now,
    };
    return { passage, progress };
  });

  // Track coverage: per-passage per-phase touch counts.
  const touchesByPassagePhase = new Map<number, Record<PhaseType, number>>();
  for (const e of pool) {
    const rec: Record<PhaseType, number> = {
      decode: 0, build: 0, connect: 0, shape: 0, perform: 0,
    };
    touchesByPassagePhase.set(e.passage.id, rec);
  }

  // Simulate HORIZON days and mirror the scheduler's phase-advancement rules.
  const horizonDays = plan.target_completion_date
    ? Math.max(7, Math.ceil((new Date(plan.target_completion_date).getTime() - Date.now()) / 86_400_000))
    : 30;
  console.log(`Simulating ${horizonDays} days.\n`);

  const sessionSummaries: string[] = [];
  const daysTouched: Record<number, number[]> = {};
  for (const e of pool) daysTouched[e.passage.id] = [];

  for (let i = 0; i < horizonDays; i++) {
    const day = new Date(now);
    day.setUTCDate(now.getUTCDate() + i);
    const dateISO = day.toISOString().slice(0, 10);
    const composed = composeSession({
      plan: {
        id: plan.id,
        userId: plan.user_id,
        repertoireEntryId: plan.repertoire_entry_id,
        sheetMusicId: plan.sheet_music_id,
        dailyPracticeMinutes: dailyMinutes,
        targetCompletionDate: plan.target_completion_date,
        totalMeasures: plan.total_measures,
        status: plan.status,
        schedulerVersion: 2,
        lastReplanAt: null,
        createdAt: now,
        updatedAt: now,
      } as LearningPlan,
      instrument: "piano",
      dateISO,
      dayIndex: i,
      budgetMinutes: dailyMinutes,
      pool,
      horizonDays,
    });

    // Mixed-phase model: each passage has its OWN phase today. Use
    // composed.passagePhaseById to attribute per-passage, not the primary.
    const touchedLabels: string[] = [];
    for (const pid of composed.touchedPassageIds) {
      daysTouched[pid]?.push(i);
      touchedLabels.push(String(pid));
      const ph = composed.passagePhaseById?.get(pid);
      if (ph) {
        const rec = touchesByPassagePhase.get(pid);
        if (rec) rec[ph] = (rec[ph] ?? 0) + 1;
      }
    }

    // Apply the scheduler's projected state update (mirror materializeUpcomingDays).
    // Mixed-phase model: phase assignment is deterministic per-day (no
    // retirement). Mirror the scheduler's materialize: update currentPhase
    // monotonically based on the phase assigned today.
    for (const pid of composed.touchedPassageIds) {
      const entry = pool.find((p) => p.passage.id === pid);
      if (!entry) continue;
      const difficulty = entry.passage.difficulty;
      const prevPhase = entry.progress.currentPhase as PhaseType;
      const assigned = composed.passagePhaseById?.get(pid);
      const newPhase: PhaseType = assigned
        ? (PHASE_TYPES.indexOf(assigned) > PHASE_TYPES.indexOf(prevPhase) ? assigned : prevPhase)
        : prevPhase;
      const phaseAdvanced = newPhase !== prevPhase;
      const growth = 1 + 1.2 / Math.max(1, Math.sqrt(difficulty));
      const newStab = Math.min(60, Number(entry.progress.srStability) * growth);
      const nextDue = new Date(dateISO + "T00:00:00Z");
      nextDue.setUTCDate(nextDue.getUTCDate() + Math.round(newStab));
      entry.progress = {
        ...entry.progress,
        introducedAt: entry.progress.introducedAt ?? dateISO,
        currentPhase: newPhase,
        phaseStartedAt: phaseAdvanced ? dateISO : entry.progress.phaseStartedAt ?? dateISO,
        phaseTouchCount: phaseAdvanced ? 1 : entry.progress.phaseTouchCount + 1,
        lastReviewedAt: dateISO,
        nextDueAt: nextDue.toISOString().slice(0, 10),
        srStability: Math.round(newStab),
      };
    }

    if (i < 3 || i === Math.floor(horizonDays / 2) || i === horizonDays - 1) {
      const phaseBreakdown = composed.sections
        .filter((s) => s.phaseType)
        .map((s) => `${s.phaseType}[${s.measureStart ?? "?"}–${s.measureEnd ?? "?"}]`)
        .join(" + ");
      const phaseCounts: Record<string, number> = {};
      const entries = Array.from(composed.passagePhaseById ?? new Map());
      for (const [, ph] of entries) {
        phaseCounts[ph] = (phaseCounts[ph] ?? 0) + 1;
      }
      const phaseSummary = Object.entries(phaseCounts).map(([p, c]) => `${p}:${c}`).join(" ");
      sessionSummaries.push(
        `Day ${i + 1} (${dateISO}): ${composed.sections.length} sections, ${composed.touchedPassageIds.length} touched. assigned={${phaseSummary}}. sections: ${phaseBreakdown}`,
      );
    }
  }

  console.log("Sample days:");
  for (const s of sessionSummaries) console.log("  " + s);

  // Coverage report.
  console.log(`\n== Coverage (${pool.length} passages) ==\n`);
  let fullyCovered = 0;
  let missingPassages = 0;
  let missingPhases = 0;
  for (const e of pool) {
    const rec = touchesByPassagePhase.get(e.passage.id)!;
    const d = e.passage.difficulty;
    const sid = e.passage.sectionId;
    const missing: string[] = [];
    let totalTouches = 0;
    for (const ph of PHASE_TYPES) {
      const required = requiredTouches(d, sid, ph);
      const got = rec[ph];
      totalTouches += got;
      if (required > 0 && got < required) {
        missing.push(`${ph}:${got}/${required}`);
      }
    }
    const days = daysTouched[e.passage.id] ?? [];
    if (days.length === 0) {
      missingPassages++;
      console.log(`  ❌ ${e.passage.label} (diff ${d}): NEVER TOUCHED`);
    } else if (missing.length > 0) {
      missingPhases++;
      console.log(`  ⚠ ${e.passage.label} (diff ${d}, ${bucket(d, sid)}): ${totalTouches} touches across ${days.length} days. Missing: ${missing.join(", ")}`);
    } else {
      fullyCovered++;
      console.log(`  ✓ ${e.passage.label} (diff ${d}, ${bucket(d, sid)}): ${totalTouches} touches across ${days.length} days, all phases hit`);
    }
  }

  console.log(`\nSummary: ${fullyCovered}/${pool.length} fully covered, ${missingPhases} partial, ${missingPassages} never touched`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
