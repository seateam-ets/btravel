import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();

export const staffUsers = pgTable("btravel_staff_users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("manager"),
  createdAt: createdAt(),
});

export const clients = pgTable(
  "btravel_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    organizationName: text("organization_name"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    address: text("address"),
    createdAt: createdAt(),
  },
  (table) => [index("btravel_clients_email_idx").on(table.email)],
);

export const quoteRequests = pgTable(
  "btravel_quote_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    contactName: text("contact_name").notNull(),
    organizationName: text("organization_name"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    billingAddress: text("billing_address"),
    transportType: text("transport_type").notNull(),
    journeyType: text("journey_type").notNull(),
    departureAt: timestamp("departure_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true, mode: "string" }),
    pickupAddress: text("pickup_address").notNull(),
    destination: text("destination").notNull(),
    passengerCount: integer("passenger_count").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("new"),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt(),
  },
  (table) => [
    index("btravel_quote_requests_status_idx").on(table.status),
    uniqueIndex("btravel_quote_requests_idempotency_idx").on(
      table.idempotencyKey,
    ),
  ],
);

export const quotes = pgTable(
  "btravel_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => quoteRequests.id),
    status: text("status").notNull().default("draft"),
    totalCents: integer("total_cents").notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    notes: text("notes"),
    decisionAt: timestamp("decision_at", { withTimezone: true, mode: "string" }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (table) => [index("btravel_quotes_request_idx").on(table.requestId)],
);

export const adminTasks = pgTable(
  "btravel_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }),
    completed: boolean("completed").notNull().default(false),
    category: text("category"),
    createdAt: createdAt(),
  },
  (table) => [index("btravel_tasks_due_idx").on(table.dueAt)],
);

export const activityEvents = pgTable(
  "btravel_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    occurredAt: createdAt(),
  },
  (table) => [index("btravel_activity_time_idx").on(table.occurredAt)],
);

export type StaffUser = typeof staffUsers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type AdminTask = typeof adminTasks.$inferSelect;
