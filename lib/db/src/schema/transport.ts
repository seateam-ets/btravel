import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients, quotes } from "./core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();

export type UnavailableInterval = { startAt: string; endAt: string };

export const vehicles = pgTable("btravel_vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  registration: text("registration").notNull().unique(),
  capacity: integer("capacity").notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  unavailableIntervals: jsonb("unavailable_intervals")
    .$type<UnavailableInterval[]>()
    .notNull()
    .default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const drivers = pgTable("btravel_drivers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  unavailableIntervals: jsonb("unavailable_intervals")
    .$type<UnavailableInterval[]>()
    .notNull()
    .default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const transports = pgTable(
  "btravel_transports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    clientId: uuid("client_id").references(() => clients.id),
    clientName: text("client_name").notNull(),
    quoteId: uuid("quote_id").references(() => quotes.id),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    pickupAddress: text("pickup_address").notNull(),
    destination: text("destination").notNull(),
    passengerCount: integer("passenger_count").notNull(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    driverId: uuid("driver_id").references(() => drivers.id),
    status: text("status").notNull().default("planned"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("btravel_transports_start_idx").on(table.startAt),
    index("btravel_transports_vehicle_idx").on(table.vehicleId),
    index("btravel_transports_driver_idx").on(table.driverId),
  ],
);

export const recurringRoutes = pgTable("btravel_recurring_routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  weekdays: jsonb("weekdays").$type<number[]>().notNull(),
  pickupAddress: text("pickup_address").notNull(),
  destination: text("destination").notNull(),
  passengerCount: integer("passenger_count").notNull(),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  driverId: uuid("driver_id").references(() => drivers.id),
  excludedRanges: jsonb("excluded_ranges")
    .$type<Array<{ startDate: string; endDate: string }>>()
    .notNull()
    .default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Transport = typeof transports.$inferSelect;
export type RecurringRoute = typeof recurringRoutes.$inferSelect;
