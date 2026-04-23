import { apiRequest } from "./queryClient";

type Infeasibility = {
  error: "plan_infeasible";
  message?: string;
  requiredTouches: number;
  availableSessions: number;
  daysNeeded: number;
  shortfallDays: number;
};

function parseInfeasibility(err: unknown): Infeasibility | null {
  if (!(err instanceof Error)) return null;
  const m = /^422:\s*([\s\S]+)$/.exec(err.message);
  if (!m) return null;
  try {
    const body = JSON.parse(m[1]);
    if (body && body.error === "plan_infeasible" && typeof body.daysNeeded === "number") {
      return body as Infeasibility;
    }
  } catch {
    // not JSON
  }
  return null;
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type GenerateLessonsResult = {
  extendedDays?: number;
  newTargetDate?: string;
};

/**
 * Generate lessons for a plan. If the server reports infeasibility (422),
 * automatically extend the plan's targetCompletionDate and retry once with
 * an explicit horizonDays matching what the scheduler needs.
 */
export async function generateLessonsWithAutoExtend(
  planId: number,
  buffer: number = 2,
): Promise<GenerateLessonsResult> {
  try {
    await apiRequest("POST", `/api/learning-plans/${planId}/generate-lessons?v=2`, {
      schedulerVersion: 2,
    });
    return {};
  } catch (err) {
    const infeasible = parseInfeasibility(err);
    if (!infeasible) throw err;

    const horizonDays = infeasible.daysNeeded + buffer;
    const newTargetDate = isoDatePlusDays(horizonDays);

    await apiRequest("PATCH", `/api/learning-plans/${planId}`, {
      targetCompletionDate: newTargetDate,
    });
    await apiRequest("POST", `/api/learning-plans/${planId}/generate-lessons?v=2`, {
      schedulerVersion: 2,
      horizonDays,
    });
    return { extendedDays: horizonDays, newTargetDate };
  }
}
