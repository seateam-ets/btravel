import { desc } from "drizzle-orm";
import { db, activityEvents } from "@workspace/db";
import { logger } from "./logger";

export async function recordActivity(label: string): Promise<void> {
  try {
    await db.insert(activityEvents).values({ label });
  } catch (error) {
    // Activity is supplementary; a successful business operation must not be
    // rolled back because its dashboard entry could not be written.
    logger.error({ err: error }, "Activity event could not be recorded");
  }
}

export async function getRecentActivity(limit = 8) {
  return db
    .select()
    .from(activityEvents)
    .orderBy(desc(activityEvents.occurredAt))
    .limit(limit);
}
