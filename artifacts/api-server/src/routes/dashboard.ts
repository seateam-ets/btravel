import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import {
  db,
  activityEvents,
  contactMessages,
  adminTasks,
  invoices,
  quoteRequests,
  quotes,
  transports,
  tripRequests,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const [
      [newRequestCount],
      [quotesToFollow],
      [upcomingTransportCount],
      [pendingTripRequestCount],
      [unpaidInvoiceTotal],
      tasks,
      activities,
      [newContactCount],
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(quoteRequests)
        .where(eq(quoteRequests.status, "new")),
      db
        .select({ value: count() })
        .from(quotes)
        .where(inArray(quotes.status, ["draft", "sent"])),
      db
        .select({ value: count() })
        .from(transports)
        .where(
          and(
            gte(transports.startAt, now),
            inArray(transports.status, ["planned", "confirmed"]),
          ),
        ),
      db
        .select({ value: count() })
        .from(tripRequests)
        .where(eq(tripRequests.status, "pending")),
      db
        .select({
          value: sql<number>`coalesce(sum(${invoices.totalCents} - ${invoices.paidCents}), 0)`,
        })
        .from(invoices)
        .where(ne(invoices.status, "cancelled")),
      db
        .select()
        .from(adminTasks)
        .where(eq(adminTasks.completed, false))
        .orderBy(asc(adminTasks.dueAt))
        .limit(5),
      db
        .select()
        .from(activityEvents)
        .orderBy(desc(activityEvents.occurredAt))
        .limit(8),
      db
        .select({ value: count() })
        .from(contactMessages)
        .where(eq(contactMessages.status, "new")),
    ]);
    const result = {
      newRequests: newRequestCount.value,
      newContactMessages: newContactCount.value,
      quotesToFollow: quotesToFollow.value,
      upcomingTransports: upcomingTransportCount.value,
      pendingTripRequests: pendingTripRequestCount.value,
      unpaidInvoicesCents: Number(unpaidInvoiceTotal.value),
      tasks: tasks.map((task) => ({
        ...task,
        dueAt: task.dueAt ?? undefined,
        category: task.category ?? undefined,
      })),
      recentActivity: activities,
    };
    res.json(api.GetDashboardResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Dashboard could not be loaded");
    res.status(500).json({ error: "Le tableau de bord est indisponible." });
  }
});

export default router;
