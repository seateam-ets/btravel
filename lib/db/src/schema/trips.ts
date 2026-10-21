import {
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

export const trips = pgTable(
  "btravel_trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    destination: text("destination").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    priceCents: integer("price_cents").notNull(),
    capacity: integer("capacity").notNull(),
    description: text("description").notNull(),
    program: text("program"),
    departurePoints: jsonb("departure_points").$type<string[]>().notNull().default([]),
    imageUrl: text("image_url"),
    visibility: text("visibility").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("btravel_trips_slug_idx").on(table.slug)],
);

export const tripRequests = pgTable(
  "btravel_trip_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    seatCount: integer("seat_count").notNull(),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("btravel_trip_requests_trip_idx").on(table.tripId),
    index("btravel_trip_requests_status_idx").on(table.status),
    uniqueIndex("btravel_trip_requests_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const passengers = pgTable(
  "btravel_passengers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripRequestId: uuid("trip_request_id")
      .notNull()
      .references(() => tripRequests.id),
    name: text("name").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [index("btravel_passengers_request_idx").on(table.tripRequestId)],
);

export type Trip = typeof trips.$inferSelect;
export type TripRequest = typeof tripRequests.$inferSelect;
export type Passenger = typeof passengers.$inferSelect;
