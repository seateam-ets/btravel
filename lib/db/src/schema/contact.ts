import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const contactMessages = pgTable(
  "btravel_contact_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    subject: text("subject"),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("btravel_contact_messages_status_idx").on(table.status)],
);

export type ContactMessage = typeof contactMessages.$inferSelect;
