import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./core";
import { transports } from "./transport";
import { tripRequests } from "./trips";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();

export const invoices = pgTable(
  "btravel_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    clientId: uuid("client_id").references(() => clients.id),
    clientName: text("client_name").notNull(),
    transportId: uuid("transport_id").references(() => transports.id),
    totalCents: integer("total_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    status: text("status").notNull().default("draft"),
    dueDate: date("due_date", { mode: "string" }),
    createdAt: createdAt(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [index("btravel_invoices_status_idx").on(table.status)],
);

export const recordedPayments = pgTable(
  "btravel_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [index("btravel_payments_target_idx").on(table.targetType, table.targetId)],
);

export const invoiceSettings = pgTable("btravel_invoice_settings", {
  id: text("id").primaryKey().default("global"),
  rulesApproved: boolean("rules_approved").notNull().default(false),
  invoicePrefix: text("invoice_prefix"),
  nextSequence: integer("next_sequence"),
  vatRatePercent: real("vat_rate_percent"),
  legalText: text("legal_text"),
  dueDays: integer("due_days"),
  reviewerName: text("reviewer_name"),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
  updatedAt: createdAt(),
});

export type Invoice = typeof invoices.$inferSelect;
export type RecordedPayment = typeof recordedPayments.$inferSelect;
export type InvoiceSettings = typeof invoiceSettings.$inferSelect;

export type PaymentTarget = typeof invoices.$inferSelect | typeof tripRequests.$inferSelect;
