import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import {
  db,
  invoiceSettings,
  invoices,
  recordedPayments,
  tripRequests,
  trips,
  transports,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { recordActivity } from "../lib/activity";

// Les dates validées par Zod arrivent en objets Date : String(date) donnerait « Wed Nov… ».
function toDay(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

const router: IRouter = Router();

function asIso(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function invoiceResponse(row: typeof invoices.$inferSelect) {
  return { ...row, dueDate: row.dueDate ?? undefined };
}

function settingsResponse(
  row: typeof invoiceSettings.$inferSelect | undefined,
) {
  return {
    rulesApproved: row?.rulesApproved ?? false,
    invoicePrefix: row?.invoicePrefix ?? null,
    nextSequence: row?.nextSequence ?? null,
    vatRatePercent: row?.vatRatePercent ?? null,
    legalText: row?.legalText ?? null,
    dueDays: row?.dueDays ?? null,
    reviewerName: row?.reviewerName ?? null,
    approvedAt: row?.approvedAt ?? null,
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(invoices).orderBy(desc(invoices.createdAt));
    res.json(api.ListInvoicesResponse.parse(rows.map(invoiceResponse)));
  } catch (error) {
    req.log.error({ err: error }, "Invoices could not be loaded");
    res.status(500).json({ error: "Les factures sont indisponibles." });
  }
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = api.CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations de la facture." });
    return;
  }
  try {
    const input = parsed.data;
    let clientName = input.clientName.trim();
    let clientId = input.clientId ?? null;
    if (input.transportId) {
      const [transport] = await db
        .select()
        .from(transports)
        .where(eq(transports.id, input.transportId))
        .limit(1);
      if (!transport) {
        res.status(404).json({ error: "Transport associé introuvable." });
        return;
      }
      clientName = transport.clientName;
      clientId = transport.clientId;
    }
    const id = randomUUID();
    const [created] = await db
      .insert(invoices)
      .values({
        id,
        reference: `BROUILLON-${id.slice(0, 8).toUpperCase()}`,
        clientId,
        clientName,
        transportId: input.transportId ?? null,
        totalCents: input.totalCents,
        dueDate: input.dueDate ? toDay(input.dueDate) : null,
        status: "draft",
      })
      .returning();
    await recordActivity(`Brouillon de facture créé pour ${created.clientName}`);
    res.status(201).json(api.CreateInvoiceResponse.parse(invoiceResponse(created)));
  } catch (error) {
    req.log.error({ err: error }, "Invoice draft could not be created");
    res.status(500).json({ error: "Le brouillon de facture n’a pas pu être créé." });
  }
});

router.get("/invoice-settings", async (req, res): Promise<void> => {
  try {
    const [settings] = await db
      .select()
      .from(invoiceSettings)
      .where(eq(invoiceSettings.id, "global"))
      .limit(1);
    res.json(api.GetInvoiceSettingsResponse.parse(settingsResponse(settings)));
  } catch (error) {
    req.log.error({ err: error }, "Invoice settings could not be loaded");
    res.status(500).json({ error: "Les paramètres de facturation sont indisponibles." });
  }
});

router.put("/invoice-settings", async (req, res): Promise<void> => {
  const parsed = api.UpdateInvoiceSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les règles et paramètres comptables." });
    return;
  }
  try {
    const input = parsed.data;
    const rulesApproved = input.accountantConfirmed;
    const now = rulesApproved ? new Date().toISOString() : null;
    await db
      .insert(invoiceSettings)
      .values({
        id: "global",
        rulesApproved,
        invoicePrefix: input.invoicePrefix.trim(),
        nextSequence: input.nextSequence,
        vatRatePercent: input.vatRatePercent,
        legalText: input.legalText.trim(),
        dueDays: input.dueDays,
        reviewerName: input.reviewerName.trim(),
        approvedAt: now,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: invoiceSettings.id,
        set: {
          rulesApproved,
          invoicePrefix: input.invoicePrefix.trim(),
          nextSequence: input.nextSequence,
          vatRatePercent: input.vatRatePercent,
          legalText: input.legalText.trim(),
          dueDays: input.dueDays,
          reviewerName: input.reviewerName.trim(),
          approvedAt: now,
          updatedAt: new Date().toISOString(),
        },
      });
    const [updated] = await db
      .select()
      .from(invoiceSettings)
      .where(eq(invoiceSettings.id, "global"))
      .limit(1);
    await recordActivity(
      rulesApproved
        ? "Règles de facturation marquées comme validées avec le comptable"
        : "Paramètres de facturation enregistrés sans validation comptable",
    );
    res.json(
      api.UpdateInvoiceSettingsResponse.parse(settingsResponse(updated)),
    );
  } catch (error) {
    req.log.error({ err: error }, "Invoice settings could not be saved");
    res.status(500).json({ error: "Les paramètres de facturation n’ont pas été enregistrés." });
  }
});

router.post("/invoices/:id/issue", async (req, res): Promise<void> => {
  const params = api.IssueInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de facture invalide." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .insert(invoiceSettings)
        .values({ id: "global", rulesApproved: false })
        .onConflictDoNothing();
      const [settings] = await tx
        .select()
        .from(invoiceSettings)
        .where(eq(invoiceSettings.id, "global"))
        .for("update")
        .limit(1);
      if (
        !settings?.rulesApproved ||
        !settings.invoicePrefix ||
        !settings.nextSequence ||
        settings.vatRatePercent === null ||
        !settings.legalText ||
        settings.dueDays === null ||
        !settings.reviewerName ||
        !settings.approvedAt
      ) {
        return { kind: "not-ready" as const };
      }
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, params.data.id))
        .for("update")
        .limit(1);
      if (!invoice) return { kind: "missing" as const };
      if (invoice.status !== "draft") return { kind: "already-issued" as const };
      const reference = `${settings.invoicePrefix}-${String(settings.nextSequence).padStart(5, "0")}`;
      const [issued] = await tx
        .update(invoices)
        .set({
          reference,
          status: "issued",
          issuedAt: new Date().toISOString(),
          dueDate:
            invoice.dueDate ??
            new Date(Date.now() + settings.dueDays * 86400000)
              .toISOString()
              .slice(0, 10),
        })
        .where(eq(invoices.id, invoice.id))
        .returning();
      await tx
        .update(invoiceSettings)
        .set({ nextSequence: settings.nextSequence + 1 })
        .where(eq(invoiceSettings.id, "global"));
      return { kind: "issued" as const, invoice: issued };
    });
    if (result.kind === "not-ready") {
      res.status(409).json({ error: "L’émission est bloquée tant que les règles comptables n’ont pas été validées et configurées." });
      return;
    }
    if (result.kind === "missing") {
      res.status(404).json({ error: "Facture introuvable." });
      return;
    }
    if (result.kind === "already-issued") {
      res.status(409).json({ error: "Cette facture ne peut plus être émise une seconde fois." });
      return;
    }
    await recordActivity(`Facture émise : ${result.invoice.reference}`);
    res.json(
      api.IssueInvoiceResponse.parse(invoiceResponse(result.invoice)),
    );
  } catch (error) {
    req.log.error({ err: error }, "Invoice could not be issued");
    res.status(500).json({ error: "La facture n’a pas pu être émise." });
  }
});

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = api.RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez le montant et le dossier associé." });
    return;
  }
  const input = parsed.data;
  const paidAt = asIso(input.paidAt)!;
  try {
    const result = await db.transaction(async (tx) => {
      if (input.targetType === "invoice") {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.id, input.targetId))
          .for("update")
          .limit(1);
        if (!invoice) return { kind: "missing" as const };
        if (!["issued", "partially_paid"].includes(invoice.status)) {
          return { kind: "invoice-not-issued" as const };
        }
        const remaining = invoice.totalCents - invoice.paidCents;
        if (input.amountCents > remaining) return { kind: "overpayment" as const };
        const [payment] = await tx
          .insert(recordedPayments)
          .values({
            targetType: "invoice",
            targetId: invoice.id,
            amountCents: input.amountCents,
            paidAt,
            note: input.note?.trim() || null,
          })
          .returning();
        const paidCents = invoice.paidCents + input.amountCents;
        await tx
          .update(invoices)
          .set({
            paidCents,
            status: paidCents === invoice.totalCents ? "paid" : "partially_paid",
          })
          .where(eq(invoices.id, invoice.id));
        return { kind: "recorded" as const, payment };
      }

      const [request] = await tx
        .select()
        .from(tripRequests)
        .where(eq(tripRequests.id, input.targetId))
        .for("update")
        .limit(1);
      if (!request) return { kind: "missing" as const };
      if (request.status !== "confirmed") return { kind: "trip-not-confirmed" as const };
      const [trip] = await tx
        .select()
        .from(trips)
        .where(eq(trips.id, request.tripId))
        .limit(1);
      if (!trip) return { kind: "missing" as const };
      const [paid] = await tx
        .select({
          amount: sql<number>`coalesce(sum(${recordedPayments.amountCents}), 0)`,
        })
        .from(recordedPayments)
        .where(
          and(
            eq(recordedPayments.targetType, "trip_request"),
            eq(recordedPayments.targetId, request.id),
          ),
        );
      const paidCents = Number(paid?.amount ?? 0);
      const dueCents = trip.priceCents * request.seatCount;
      if (paidCents + input.amountCents > dueCents) return { kind: "overpayment" as const };
      const [payment] = await tx
        .insert(recordedPayments)
        .values({
          targetType: "trip_request",
          targetId: request.id,
          amountCents: input.amountCents,
          paidAt,
          note: input.note?.trim() || null,
        })
        .returning();
      return { kind: "recorded" as const, payment };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Dossier introuvable." });
      return;
    }
    if (result.kind === "invoice-not-issued") {
      res.status(409).json({ error: "Un paiement de facture peut être saisi après son émission." });
      return;
    }
    if (result.kind === "trip-not-confirmed") {
      res.status(409).json({ error: "Le paiement peut être saisi après confirmation de l’inscription." });
      return;
    }
    if (result.kind === "overpayment") {
      res.status(409).json({ error: "Le montant dépasse le solde restant." });
      return;
    }
    await recordActivity(`Paiement manuel enregistré : ${result.payment.amountCents} centimes`);
    res.status(201).json(
      api.RecordPaymentResponse.parse({
        ...result.payment,
        note: result.payment.note ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Payment could not be recorded");
    res.status(500).json({ error: "Le paiement n’a pas pu être enregistré." });
  }
});

export default router;
