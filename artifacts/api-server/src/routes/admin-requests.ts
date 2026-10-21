import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import {
  clients,
  db,
  invoices,
  quoteRequests,
  quotes,
  transports,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { recordActivity } from "../lib/activity";

const router: IRouter = Router();

function makeReference(prefix: string, id: string): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return `${prefix}-${day}-${id.slice(0, 6).toUpperCase()}`;
}

function asIso(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicRequestRow(row: typeof quoteRequests.$inferSelect) {
  return {
    ...row,
    organizationName: row.organizationName ?? undefined,
    billingAddress: row.billingAddress ?? undefined,
    returnAt: row.returnAt ?? undefined,
    notes: row.notes ?? undefined,
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  try {
    const rows = await db
      .select()
      .from(clients)
      .where(search ? ilike(clients.name, `%${search.replaceAll("%", "\\%")}%`) : undefined)
      .orderBy(clients.name);
    res.json(api.ListClientsResponse.parse(rows));
  } catch (error) {
    req.log.error({ err: error }, "Clients could not be loaded");
    res.status(500).json({ error: "La liste des clients est indisponible." });
  }
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = api.CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les coordonnées du client." });
    return;
  }
  try {
    const input = parsed.data;
    const [created] = await db
      .insert(clients)
      .values({
        name: input.name.trim(),
        organizationName: input.organizationName?.trim() || null,
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        address: input.address?.trim() || null,
      })
      .returning();
    await recordActivity(`Client ajouté : ${created.name}`);
    res.status(201).json(api.CreateClientResponse.parse(created));
  } catch (error) {
    req.log.error({ err: error }, "Client could not be created");
    res.status(500).json({ error: "Le client n’a pas pu être enregistré." });
  }
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const parsed = api.GetClientParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Identifiant client invalide." });
    return;
  }
  try {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, parsed.data.id))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }
    res.json(api.GetClientResponse.parse(client));
  } catch (error) {
    req.log.error({ err: error }, "Client could not be loaded");
    res.status(500).json({ error: "Le dossier client est indisponible." });
  }
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = api.UpdateClientParams.safeParse(req.params);
  const body = api.UpdateClientBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les coordonnées du client." });
    return;
  }
  try {
    const input = body.data;
    const [updated] = await db
      .update(clients)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.organizationName !== undefined && {
          organizationName: input.organizationName?.trim() || null,
        }),
        ...(input.email !== undefined && { email: input.email.trim().toLowerCase() }),
        ...(input.phone !== undefined && { phone: input.phone.trim() }),
        ...(input.address !== undefined && { address: input.address?.trim() || null }),
      })
      .where(eq(clients.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }
    res.json(api.UpdateClientResponse.parse(updated));
  } catch (error) {
    req.log.error({ err: error }, "Client could not be updated");
    res.status(500).json({ error: "Les modifications du client n’ont pas été enregistrées." });
  }
});

router.get("/clients/:id/history", async (req, res): Promise<void> => {
  const params = api.GetClientHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant client invalide." });
    return;
  }
  try {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, params.data.id))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }
    const requests = await db
      .select()
      .from(quoteRequests)
      .where(eq(quoteRequests.email, client.email))
      .orderBy(desc(quoteRequests.createdAt));
    const requestIds = requests.map((row) => row.id);
    const quoteRows = requestIds.length
      ? await db.select().from(quotes).where(inArray(quotes.requestId, requestIds))
      : [];
    const transportRows = await db
      .select()
      .from(transports)
      .where(eq(transports.clientId, client.id))
      .orderBy(desc(transports.startAt));
    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.clientId, client.id))
      .orderBy(desc(invoices.createdAt));
    res.json(
      api.GetClientHistoryResponse.parse({
        requests: requests.map(publicRequestRow),
        quotes: quoteRows.map((row) => ({
          ...row,
          validUntil: row.validUntil ?? undefined,
          notes: row.notes ?? undefined,
        })),
        transports: transportRows.map((row) => ({
          ...row,
          notes: row.notes ?? undefined,
        })),
        invoices: invoiceRows.map((row) => ({ ...row, dueDate: row.dueDate ?? undefined })),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Client history could not be loaded");
    res.status(500).json({ error: "L’historique du client est indisponible." });
  }
});

router.get("/quote-requests", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  try {
    const rows = await db
      .select()
      .from(quoteRequests)
      .where(status ? eq(quoteRequests.status, status) : undefined)
      .orderBy(desc(quoteRequests.createdAt));
    res.json(api.ListQuoteRequestsResponse.parse(rows.map(publicRequestRow)));
  } catch (error) {
    req.log.error({ err: error }, "Quote requests could not be loaded");
    res.status(500).json({ error: "Les demandes de devis sont indisponibles." });
  }
});

router.post("/quote-requests", async (req, res): Promise<void> => {
  const parsed = api.CreateManualQuoteRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations de la demande." });
    return;
  }
  try {
    const input = parsed.data;
    const id = randomUUID();
    const [created] = await db
      .insert(quoteRequests)
      .values({
        id,
        reference: makeReference("DMD", id),
        contactName: input.contactName.trim(),
        organizationName: input.organizationName?.trim() || null,
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        billingAddress: input.billingAddress?.trim() || null,
        transportType: input.transportType.trim(),
        journeyType: input.journeyType,
        departureAt: asIso(input.departureAt)!,
        returnAt: asIso(input.returnAt) ?? null,
        pickupAddress: input.pickupAddress.trim(),
        destination: input.destination.trim(),
        passengerCount: input.passengerCount,
        notes: input.notes?.trim() || null,
      })
      .returning();
    await recordActivity(`Demande de devis saisie : ${created.reference}`);
    res.status(201).json(api.CreateManualQuoteRequestResponse.parse(publicRequestRow(created)));
  } catch (error) {
    req.log.error({ err: error }, "Manual quote request could not be saved");
    res.status(500).json({ error: "La demande n’a pas pu être enregistrée." });
  }
});

router.patch("/quote-requests/:id/status", async (req, res): Promise<void> => {
  const params = api.UpdateQuoteRequestStatusParams.safeParse(req.params);
  const body = api.UpdateQuoteRequestStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez le statut de la demande." });
    return;
  }
  try {
    const [updated] = await db
      .update(quoteRequests)
      .set({ status: body.data.status })
      .where(eq(quoteRequests.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Demande introuvable." });
      return;
    }
    await recordActivity(`Statut modifié pour ${updated.reference}`);
    res.json(api.UpdateQuoteRequestStatusResponse.parse(publicRequestRow(updated)));
  } catch (error) {
    req.log.error({ err: error }, "Quote request status could not be updated");
    res.status(500).json({ error: "Le statut n’a pas pu être modifié." });
  }
});

router.get("/quotes", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ quote: quotes, request: quoteRequests })
      .from(quotes)
      .leftJoin(quoteRequests, eq(quotes.requestId, quoteRequests.id))
      .orderBy(desc(quotes.createdAt));
    res.json(
      api.ListQuotesResponse.parse(
        rows.map(({ quote, request }) => ({
          ...quote,
          requestReference: request?.reference ?? null,
          clientName: request?.organizationName || request?.contactName || null,
          organizationName: request?.organizationName ?? null,
          email: request?.email ?? null,
          departureAt: request ? asIso(request.departureAt) ?? null : null,
          pickupAddress: request?.pickupAddress ?? null,
          destination: request?.destination ?? null,
          validUntil: quote.validUntil ?? undefined,
          notes: quote.notes ?? undefined,
        })),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Quotes could not be loaded");
    res.status(500).json({ error: "Les devis sont indisponibles." });
  }
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = api.CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez le montant et la demande associés." });
    return;
  }
  try {
    const [request] = await db
      .select()
      .from(quoteRequests)
      .where(eq(quoteRequests.id, parsed.data.requestId))
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Demande introuvable." });
      return;
    }
    const id = randomUUID();
    const [created] = await db
      .insert(quotes)
      .values({
        id,
        reference: makeReference("DEV", id),
        requestId: request.id,
        totalCents: parsed.data.totalCents,
        validUntil: parsed.data.validUntil
          ? String(parsed.data.validUntil).slice(0, 10)
          : null,
        notes: parsed.data.notes?.trim() || null,
      })
      .returning();
    await db
      .update(quoteRequests)
      .set({ status: "processing" })
      .where(eq(quoteRequests.id, request.id));
    await recordActivity(`Devis préparé : ${created.reference}`);
    res.status(201).json(
      api.CreateQuoteResponse.parse({
        ...created,
        validUntil: created.validUntil ?? undefined,
        notes: created.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Quote could not be created");
    res.status(500).json({ error: "Le devis n’a pas pu être enregistré." });
  }
});

router.patch("/quotes/:id/status", async (req, res): Promise<void> => {
  const params = api.UpdateQuoteStatusParams.safeParse(req.params);
  const body = api.UpdateQuoteStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez le statut du devis." });
    return;
  }
  try {
    const [updated] = await db
      .update(quotes)
      .set({ status: body.data.status })
      .where(eq(quotes.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Devis introuvable." });
      return;
    }
    res.json(
      api.UpdateQuoteStatusResponse.parse({
        ...updated,
        validUntil: updated.validUntil ?? undefined,
        notes: updated.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Quote status could not be updated");
    res.status(500).json({ error: "Le statut du devis n’a pas pu être modifié." });
  }
});

router.post("/quotes/:id/decision", async (req, res): Promise<void> => {
  const params = api.RecordQuoteDecisionParams.safeParse(req.params);
  const body = api.RecordQuoteDecisionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez la réponse reçue du client." });
    return;
  }
  try {
    const [current] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Devis introuvable." });
      return;
    }
    if (current.status !== "sent") {
      res.status(409).json({ error: "La réponse ne peut être enregistrée que pour un devis envoyé." });
      return;
    }
    const [updated] = await db
      .update(quotes)
      .set({
        status: body.data.decision,
        decisionAt: asIso(body.data.receivedAt),
        decisionNote: body.data.note?.trim() || null,
      })
      .where(eq(quotes.id, current.id))
      .returning();
    await recordActivity(
      `Réponse du client enregistrée pour ${updated.reference}`,
    );
    res.json(
      api.RecordQuoteDecisionResponse.parse({
        ...updated,
        validUntil: updated.validUntil ?? undefined,
        notes: updated.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Quote decision could not be recorded");
    res.status(500).json({ error: "La réponse du client n’a pas pu être enregistrée." });
  }
});

router.post("/quotes/:id/convert", async (req, res): Promise<void> => {
  const params = api.ConvertQuoteToTransportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de devis invalide." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, params.data.id))
        .for("update")
        .limit(1);
      if (!quote || quote.status !== "accepted") return { kind: "not-accepted" as const };
      const [existing] = await tx
        .select()
        .from(transports)
        .where(eq(transports.quoteId, quote.id))
        .limit(1);
      if (existing) return { kind: "existing" as const, transport: existing };
      const [request] = await tx
        .select()
        .from(quoteRequests)
        .where(eq(quoteRequests.id, quote.requestId))
        .limit(1);
      if (!request) return { kind: "request-missing" as const };
      const [client] = await tx
        .select()
        .from(clients)
        .where(eq(clients.email, request.email))
        .limit(1);
      const id = randomUUID();
      const [transport] = await tx
        .insert(transports)
        .values({
          id,
          reference: makeReference("TR", id),
          clientId: client?.id ?? null,
          clientName: client?.name ?? request.contactName,
          quoteId: quote.id,
          startAt: request.departureAt,
          endAt: request.returnAt ?? request.departureAt,
          pickupAddress: request.pickupAddress,
          destination: request.destination,
          passengerCount: request.passengerCount,
          status: "planned",
          notes: request.notes,
        })
        .returning();
      return { kind: "created" as const, transport };
    });
    if (result.kind === "not-accepted") {
      res.status(409).json({ error: "Le devis doit être accepté avant sa conversion." });
      return;
    }
    if (result.kind === "request-missing") {
      res.status(404).json({ error: "La demande associée au devis est introuvable." });
      return;
    }
    if (result.kind === "created") {
      await recordActivity(`Transport créé : ${result.transport.reference}`);
    }
    res.status(result.kind === "created" ? 201 : 200).json(
      api.ConvertQuoteToTransportResponse.parse({
        ...result.transport,
        notes: result.transport.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Quote could not be converted to transport");
    res.status(500).json({ error: "Le transport n’a pas pu être créé depuis ce devis." });
  }
});

export default router;
