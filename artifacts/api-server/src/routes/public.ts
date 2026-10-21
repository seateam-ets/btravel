import { and, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import * as api from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import {
  contactMessages,
  db,
  quoteRequests,
  tripRequests,
  trips,
} from "@workspace/db";
import { recordActivity } from "../lib/activity";

const router: IRouter = Router();
const publicSubmissionWindowMs = 10 * 60 * 1000;
const publicSubmissionLimit = 12;
const submissionCounts = new Map<string, { start: number; count: number }>();
const allowedUploadExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

function limitPublicSubmissions(req: Request, res: Response): boolean {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = submissionCounts.get(key);
  if (!current || now - current.start >= publicSubmissionWindowMs) {
    submissionCounts.set(key, { start: now, count: 1 });
    return true;
  }
  if (current.count >= publicSubmissionLimit) {
    res.status(429).json({ error: "Trop de demandes. Réessayez un peu plus tard." });
    return false;
  }
  current.count += 1;
  return true;
}

function reference(prefix: string, id: string): string {
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

function apiDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function currentBrusselsDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function publicTripRows(tripId?: string) {
  const where = tripId
    ? and(
        eq(trips.visibility, "published"),
        eq(trips.id, tripId),
        gte(trips.endDate, currentBrusselsDate()),
      )
    : and(
        eq(trips.visibility, "published"),
        gte(trips.endDate, currentBrusselsDate()),
      );
  const rows = await db
    .select()
    .from(trips)
    .where(where)
    .orderBy(trips.startDate);
  if (!rows.length) return [];

  const confirmed = await db
    .select({
      tripId: tripRequests.tripId,
      seats: sql<number>`coalesce(sum(${tripRequests.seatCount}), 0)`,
    })
    .from(tripRequests)
    .where(eq(tripRequests.status, "confirmed"))
    .groupBy(tripRequests.tripId);
  const seatsByTrip = new Map(confirmed.map((item) => [item.tripId, Number(item.seats)]));

  return rows.map((trip) => ({
    ...trip,
    remainingSeats: Math.max(0, trip.capacity - (seatsByTrip.get(trip.id) ?? 0)),
  }));
}

router.get("/public/trips", async (req, res): Promise<void> => {
  try {
    res.json(api.ListPublicTripsResponse.parse(await publicTripRows()));
  } catch (error) {
    req.log.error({ err: error }, "Public trips could not be loaded");
    res.status(500).json({ error: "Les voyages ne sont pas disponibles." });
  }
});

router.get("/public/trips/:id", async (req, res): Promise<void> => {
  try {
    const [trip] = await publicTripRows(String(req.params.id));
    if (!trip) {
      res.status(404).json({ error: "Voyage introuvable." });
      return;
    }
    res.json(api.GetPublicTripResponse.parse(trip));
  } catch (error) {
    req.log.error({ err: error }, "Public trip could not be loaded");
    res.status(500).json({ error: "Ce voyage n’est pas disponible." });
  }
});

router.post("/quote-requests", async (req, res): Promise<void> => {
  const parsed = api.CreateQuoteRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations de votre demande." });
    return;
  }
  if (!limitPublicSubmissions(req, res)) return;

  const input = parsed.data;
  const departureAt = apiDate(input.departureAt);
  const returnAt = input.returnAt ? apiDate(input.returnAt) : null;
  if (
    (input.journeyType === "return" && !returnAt) ||
    (returnAt && Date.parse(returnAt) < Date.parse(departureAt))
  ) {
    res.status(400).json({ error: "La date de retour doit suivre la date de départ." });
    return;
  }

  const header = req.get("Idempotency-Key");
  const idempotencyKey =
    header && header.length >= 16 && header.length <= 100 ? header : null;
  try {
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(quoteRequests)
        .where(eq(quoteRequests.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        const same =
          existing.email === input.email.trim().toLowerCase() &&
          existing.departureAt === departureAt &&
          existing.pickupAddress === input.pickupAddress &&
          existing.destination === input.destination &&
          existing.passengerCount === input.passengerCount;
        if (!same) {
          res.status(409).json({ error: "Cette référence a déjà été utilisée pour une autre demande." });
          return;
        }
        res.status(200).json(
          api.CreateQuoteRequestResponse.parse({
            id: existing.id,
            reference: existing.reference,
            createdAt: existing.createdAt,
          }),
        );
        return;
      }
    }

    const id = randomUUID();
    const formattedReference = reference("DMD", id);
    const [created] = await db
      .insert(quoteRequests)
      .values({
        id,
        contactName: input.contactName.trim(),
        organizationName: input.organizationName?.trim() || null,
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        transportType: input.transportType.trim(),
        journeyType: input.journeyType,
        departureAt,
        returnAt,
        pickupAddress: input.pickupAddress.trim(),
        destination: input.destination.trim(),
        passengerCount: input.passengerCount,
        notes: input.notes?.trim() || null,
        idempotencyKey,
        reference: formattedReference,
      })
      .returning();
    await recordActivity(`Nouvelle demande de devis ${formattedReference}`);
    res.status(201).json(
      api.CreateQuoteRequestResponse.parse({
        id: created.id,
        reference: formattedReference,
        createdAt: created.createdAt,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Public quote request could not be saved");
    res.status(500).json({ error: "La demande n’a pas pu être enregistrée. Réessayez." });
  }
});

router.post("/contact-messages", async (req, res): Promise<void> => {
  const parsed = api.CreateContactMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez votre nom, votre e-mail et votre message." });
    return;
  }
  if (!limitPublicSubmissions(req, res)) return;
  const input = parsed.data;
  try {
    const id = randomUUID();
    const formattedReference = reference("MSG", id);
    const [created] = await db
      .insert(contactMessages)
      .values({
        id,
        reference: formattedReference,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        subject: input.subject?.trim() || null,
        message: input.message.trim(),
      })
      .returning();
    await recordActivity(`Nouvelle demande de contact de ${created.name}`);
    res.status(201).json(
      api.CreateContactMessageResponse.parse({
        id: created.id,
        reference: created.reference,
        createdAt: created.createdAt,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Contact message could not be saved");
    res.status(500).json({ error: "Le message n’a pas pu être envoyé. Réessayez." });
  }
});

router.post("/trip-requests", async (req, res): Promise<void> => {
  const parsed = api.CreateTripRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations de votre demande." });
    return;
  }
  if (!limitPublicSubmissions(req, res)) return;

  const input = parsed.data;
  const header = req.get("Idempotency-Key");
  const idempotencyKey =
    header && header.length >= 16 && header.length <= 100 ? header : null;
  try {
    const [trip] = await db
      .select()
      .from(trips)
      .where(
        and(
          eq(trips.id, input.tripId),
          eq(trips.visibility, "published"),
          gte(trips.endDate, currentBrusselsDate()),
        ),
      )
      .limit(1);
    if (!trip) {
      res.status(404).json({ error: "Ce voyage n’est plus disponible." });
      return;
    }
    if (input.seatCount > trip.capacity) {
      res.status(409).json({ error: "Le nombre de places demandé dépasse la capacité du voyage." });
      return;
    }
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(tripRequests)
        .where(eq(tripRequests.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        const same =
          existing.tripId === input.tripId &&
          existing.email === input.email.toLowerCase() &&
          existing.seatCount === input.seatCount;
        if (!same) {
          res.status(409).json({ error: "Cette référence a déjà été utilisée pour une autre demande." });
          return;
        }
        res.status(200).json(
          api.CreateTripRequestResponse.parse({
            id: existing.id,
            reference: existing.reference,
            createdAt: existing.createdAt,
          }),
        );
        return;
      }
    }
    const id = randomUUID();
    const formattedReference = reference("INS", id);
    const [created] = await db
      .insert(tripRequests)
      .values({
        id,
        tripId: input.tripId,
        contactName: input.contactName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        seatCount: input.seatCount,
        notes: input.notes?.trim() || null,
        idempotencyKey,
        reference: formattedReference,
      })
      .returning();
    await recordActivity(`Nouvelle demande de voyage ${formattedReference}`);
    res.status(201).json(
      api.CreateTripRequestResponse.parse({
        id: created.id,
        reference: formattedReference,
        createdAt: created.createdAt,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Public trip request could not be saved");
    res.status(500).json({ error: "La demande n’a pas pu être enregistrée. Réessayez." });
  }
});

export default router;
