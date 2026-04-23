import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    SELECT lp.id, lp.user_id, lp.scheduler_version, lp.total_measures, lp.status,
           (SELECT COUNT(*) FROM plan_sections ps WHERE ps.learning_plan_id = lp.id) AS sections,
           (SELECT COUNT(*) FROM lesson_days ld WHERE ld.learning_plan_id = lp.id) AS lessons
    FROM learning_plans lp ORDER BY lp.id DESC LIMIT 10
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
