import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const documents = pgTable(
  "btravel_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    objectPath: text("object_path").notNull().unique(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("btravel_documents_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type Document = typeof documents.$inferSelect;
