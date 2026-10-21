import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import {
  db,
  passengers,
  recordedPayments,
  tripRequests,
  trips,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { recordActivity } from "../lib/activity";

const router: IRouter = Router();

function dateValue(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function tripRows() {
  const rows = await db.select().from(trips).orderBy(trips.startDate);
  const totals = await db
    .select({
      tripId: tripRequests.tripId,
      seats: sql<number>`coalesce(sum(${tripRequests.seatCount}), 0)`,
    })
    .from(tripRequests)
    .where(eq(tripRequests.status, "confirmed"))
    .groupBy(tripRequests.tripId);
  const booked = new Map(totals.map((row) => [row.tripId, Number(row.seats)]));
  return rows.map((trip) => ({
    ...trip,
    remainingSeats: Math.max(0, trip.capacity - (booked.get(trip.id) ?? 0)),
  }));
}

router.get("/trips", async (req, res): Promise<void> => {
  try {
    res.json(api.ListAdminTripsResponse.parse(await tripRows()));
  } catch (error) {
    req.log.error({ err: error }, "Admin trips could not be loaded");
    res.status(500).json({ error: "Les voyages sont indisponibles." });
  }
});

router.post("/trips", async (req, res): Promise<void> => {
  const parsed = api.CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations du voyage." });
    return;
  }
  const input = parsed.data;
  const startDate = dateValue(input.startDate);
  const endDate = dateValue(input.endDate);
  if (startDate > endDate) {
    res.status(400).json({ error: "La date de fin doit suivre la date de départ." });
    return;
  }
  try {
    const [created] = await db
      .insert(trips)
      .values({
        slug: input.slug.trim().toLowerCase(),
        title: input.title.trim(),
        destination: input.destination.trim(),
        startDate,
        endDate,
        priceCents: input.priceCents,
        capacity: input.capacity,
        description: input.description.trim(),
        program: input.program?.trim() || null,
        departurePoints: input.departurePoints ?? [],
        imageUrl: input.imageUrl?.trim() || null,
        visibility: input.visibility ?? "draft",
      })
      .returning();
    await recordActivity(`Voyage créé : ${created.title}`);
    res.status(201).json(
      api.CreateTripResponse.parse({
        ...created,
        remainingSeats: created.capacity,
        program: created.program ?? undefined,
        imageUrl: created.imageUrl ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Trip could not be created");
    res.status(500).json({ error: "Le voyage n’a pas pu être enregistré." });
  }
});

router.patch("/trips/:id", async (req, res): Promise<void> => {
  const params = api.UpdateTripParams.safeParse(req.params);
  const body = api.UpdateTripBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications du voyage." });
    return;
  }
  try {
    const [current] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Voyage introuvable." });
      return;
    }
    const [booked] = await db
      .select({
        seats: sql<number>`coalesce(sum(${tripRequests.seatCount}), 0)`,
      })
      .from(tripRequests)
      .where(
        and(
          eq(tripRequests.tripId, current.id),
          eq(tripRequests.status, "confirmed"),
        ),
      );
    const capacity = body.data.capacity ?? current.capacity;
    if (capacity < Number(booked?.seats ?? 0)) {
      res.status(409).json({ error: "La capacité ne peut pas être inférieure au nombre de places déjà confirmées." });
      return;
    }
    const [updated] = await db
      .update(trips)
      .set({
        ...(body.data.title !== undefined && { title: body.data.title.trim() }),
        ...(body.data.description !== undefined && { description: body.data.description.trim() }),
        ...(body.data.program !== undefined && { program: body.data.program?.trim() || null }),
        ...(body.data.priceCents !== undefined && { priceCents: body.data.priceCents }),
        ...(body.data.capacity !== undefined && { capacity: body.data.capacity }),
        ...(body.data.visibility !== undefined && { visibility: body.data.visibility }),
      })
      .where(eq(trips.id, current.id))
      .returning();
    res.json(
      api.UpdateTripResponse.parse({
        ...updated,
        remainingSeats: Math.max(0, updated.capacity - Number(booked?.seats ?? 0)),
        program: updated.program ?? undefined,
        imageUrl: updated.imageUrl ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Trip could not be updated");
    res.status(500).json({ error: "Le voyage n’a pas pu être modifié." });
  }
});

router.get("/trip-requests", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        request: tripRequests,
        tripTitle: trips.title,
        tripPriceCents: trips.priceCents,
      })
      .from(tripRequests)
      .innerJoin(trips, eq(tripRequests.tripId, trips.id))
      .orderBy(desc(tripRequests.createdAt));
    const ids = rows.map(({ request }) => request.id);
    const paidRows = ids.length
      ? await db
          .select({
            targetId: recordedPayments.targetId,
            paid: sql<number>`coalesce(sum(${recordedPayments.amountCents}), 0)`,
          })
          .from(recordedPayments)
          .where(
            and(
              eq(recordedPayments.targetType, "trip_request"),
              inArray(recordedPayments.targetId, ids),
            ),
          )
          .groupBy(recordedPayments.targetId)
      : [];
    const paidByRequest = new Map(paidRows.map((row) => [row.targetId, Number(row.paid)]));
    res.json(
      api.ListTripRequestsResponse.parse(
        rows.map(({ request, tripTitle, tripPriceCents }) => {
          const paid = paidByRequest.get(request.id) ?? 0;
          const amountDue = request.seatCount * tripPriceCents;
          return {
            ...request,
            tripTitle,
            amountDueCents: amountDue,
            amountPaidCents: paid,
            paymentState: paid >= amountDue ? "paid" : paid === 0 ? "unpaid" : "partial",
            notes: request.notes ?? undefined,
          };
        }),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Trip requests could not be loaded");
    res.status(500).json({ error: "Les inscriptions sont indisponibles." });
  }
});

router.patch("/trip-requests/:id/status", async (req, res): Promise<void> => {
  const params = api.UpdateTripRequestStatusParams.safeParse(req.params);
  const body = api.UpdateTripRequestStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez le statut de la demande." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(tripRequests)
        .where(eq(tripRequests.id, params.data.id))
        .for("update")
        .limit(1);
      if (!request) return { kind: "missing" as const };
      if (body.data.status === "confirmed" && request.status !== "confirmed") {
        const [trip] = await tx
          .select()
          .from(trips)
          .where(eq(trips.id, request.tripId))
          .for("update")
          .limit(1);
        if (!trip || trip.visibility !== "published") {
          return { kind: "unavailable" as const };
        }
        const [used] = await tx
          .select({
            seats: sql<number>`coalesce(sum(${tripRequests.seatCount}), 0)`,
          })
          .from(tripRequests)
          .where(
            and(
              eq(tripRequests.tripId, trip.id),
              eq(tripRequests.status, "confirmed"),
            ),
          );
        if (Number(used?.seats ?? 0) + request.seatCount > trip.capacity) {
          return { kind: "full" as const };
        }
      }
      const [updated] = await tx
        .update(tripRequests)
        .set({ status: body.data.status })
        .where(eq(tripRequests.id, request.id))
        .returning();
      const [trip] = await tx
        .select({ title: trips.title, priceCents: trips.priceCents })
        .from(trips)
        .where(eq(trips.id, request.tripId))
        .limit(1);
      const [paidRow] = await tx
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
      return {
        kind: "updated" as const,
        request: updated,
        tripTitle: trip?.title ?? "",
        amountDueCents: updated.seatCount * Number(trip?.priceCents ?? 0),
        amountPaidCents: Number(paidRow?.amount ?? 0),
      };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Inscription introuvable." });
      return;
    }
    if (result.kind === "unavailable") {
      res.status(409).json({ error: "Le voyage doit être publié pour confirmer cette inscription." });
      return;
    }
    if (result.kind === "full") {
      res.status(409).json({ error: "Il n’y a plus assez de places disponibles." });
      return;
    }
    await recordActivity(`Inscription ${result.request.reference} : ${result.request.status}`);
    res.json(
      api.UpdateTripRequestStatusResponse.parse({
        ...result.request,
        tripTitle: result.tripTitle,
        amountDueCents: result.amountDueCents,
        amountPaidCents: result.amountPaidCents,
        paymentState:
          result.amountPaidCents >= result.amountDueCents
            ? "paid"
            : result.amountPaidCents === 0
              ? "unpaid"
              : "partial",
        notes: result.request.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Trip request status could not be updated");
    res.status(500).json({ error: "Le statut de l’inscription n’a pas pu être modifié." });
  }
});

router.get("/trip-requests/:id/passengers", async (req, res): Promise<void> => {
  const params = api.ListPassengersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant d’inscription invalide." });
    return;
  }
  try {
    const [request] = await db
      .select()
      .from(tripRequests)
      .where(eq(tripRequests.id, params.data.id))
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Inscription introuvable." });
      return;
    }
    const rows = await db
      .select()
      .from(passengers)
      .where(eq(passengers.tripRequestId, request.id))
      .orderBy(passengers.name);
    res.json(api.ListPassengersResponse.parse(rows.map((row) => ({ ...row, note: row.note ?? undefined }))));
  } catch (error) {
    req.log.error({ err: error }, "Passengers could not be loaded");
    res.status(500).json({ error: "La liste des passagers est indisponible." });
  }
});

router.post("/trip-requests/:id/passengers", async (req, res): Promise<void> => {
  const params = api.CreatePassengerParams.safeParse(req.params);
  const body = api.CreatePassengerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez le nom du passager." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(tripRequests)
        .where(eq(tripRequests.id, params.data.id))
        .for("update")
        .limit(1);
      if (!request) return { kind: "missing" as const };
      if (request.status !== "confirmed") return { kind: "not-confirmed" as const };
      const existing = await tx
        .select()
        .from(passengers)
        .where(eq(passengers.tripRequestId, request.id));
      if (existing.length >= request.seatCount) return { kind: "full" as const };
      const [passenger] = await tx
        .insert(passengers)
        .values({
          tripRequestId: request.id,
          name: body.data.name.trim(),
          note: body.data.note?.trim() || null,
        })
        .returning();
      return { kind: "created" as const, passenger };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Inscription introuvable." });
      return;
    }
    if (result.kind === "not-confirmed") {
      res.status(409).json({ error: "Les noms des passagers sont disponibles après confirmation." });
      return;
    }
    if (result.kind === "full") {
      res.status(409).json({ error: "Le nombre de passagers atteint le nombre de places confirmées." });
      return;
    }
    res.status(201).json(
      api.CreatePassengerResponse.parse({
        ...result.passenger,
        note: result.passenger.note ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Passenger could not be added");
    res.status(500).json({ error: "Le passager n’a pas pu être enregistré." });
  }
});

router.patch("/passengers/:id", async (req, res): Promise<void> => {
  const params = api.UpdatePassengerParams.safeParse(req.params);
  const body = api.UpdatePassengerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les informations du passager." });
    return;
  }
  try {
    const [updated] = await db
      .update(passengers)
      .set({
        ...(body.data.name !== undefined && { name: body.data.name.trim() }),
        ...(body.data.note !== undefined && { note: body.data.note?.trim() || null }),
      })
      .where(eq(passengers.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Passager introuvable." });
      return;
    }
    res.json(
      api.UpdatePassengerResponse.parse({
        ...updated,
        note: updated.note ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Passenger could not be updated");
    res.status(500).json({ error: "Le passager n’a pas pu être modifié." });
  }
});

export default router;
