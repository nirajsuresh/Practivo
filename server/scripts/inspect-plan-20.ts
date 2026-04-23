import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const planId = Number(process.argv[2] ?? 20);
  const plan = (await db.execute(sql`SELECT id, total_measures, scheduler_version, target_completion_date, daily_practice_minutes FROM learning_plans WHERE id = ${planId}`)).rows[0] as any;
  console.log("Plan:", plan);

  const secs = (await db.execute(sql`SELECT id, name, measure_start, measure_end, difficulty, ignored FROM plan_sections WHERE learning_plan_id = ${planId} ORDER BY display_order`)).rows as any[];
  console.log(`\n${secs.length} plan_sections:`);
  for (const s of secs) console.log(`  ${s.id} ${s.name.padEnd(12)} bars ${s.measure_start}-${s.measure_end} diff=${s.difficulty} ignored=${s.ignored}`);

  const passages = (await db.execute(sql`SELECT id, label, section_id, measure_start, measure_end, difficulty FROM passages WHERE learning_plan_id = ${planId} ORDER BY display_order`)).rows as any[];
  console.log(`\n${passages.length} passages:`);
  const gapCount = passages.filter((p) => p.section_id === null).length;
  const markedCount = passages.length - gapCount;
  console.log(`  ${markedCount} from marked sections, ${gapCount} from gap synthesis`);
  for (const p of passages) console.log(`  ${String(p.id).padEnd(5)} sec=${String(p.section_id ?? "null").padEnd(5)} ${p.label.padEnd(30)} bars ${p.measure_start}-${p.measure_end}`);

  const lessons = (await db.execute(sql`SELECT id, scheduled_date, measure_start, measure_end, jsonb_array_length(tasks) AS sec_count FROM lesson_days WHERE learning_plan_id = ${planId} ORDER BY scheduled_date`)).rows as any[];
  console.log(`\n${lessons.length} lesson_days:`);
  for (const l of lessons) console.log(`  ${l.scheduled_date}  bars ${l.measure_start}-${l.measure_end}  (${l.sec_count} sections)`);

  // Check which labels actually appear
  const labels = new Set<string>();
  for (const l of lessons) {
    const tasks = (await db.execute(sql`SELECT tasks FROM lesson_days WHERE id = ${l.id}`)).rows[0] as any;
    for (const sec of tasks.tasks ?? []) labels.add(sec.label ?? "(no label)");
  }
  console.log(`\nUnique section labels across all lesson_days:`);
  for (const lbl of Array.from(labels).sort()) console.log(`  "${lbl}"`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
