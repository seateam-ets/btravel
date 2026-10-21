import { and, desc, eq, gt, gte, lt, ne, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import {
  db,
  drivers,
  recurringRoutes,
  transports,
  vehicles,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { recordActivity } from "../lib/activity";

const router: IRouter = Router();

function makeReference(id: string): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return `TR-${day}-${id.slice(0, 6).toUpperCase()}`;
}

function toIso(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateValue(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}

function localBrusselsDateTimeToIso(day: string, time: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, date, hour, minute);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desiredAsUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const offset = representedAsUtc - desiredAsUtc;
  return new Date(desiredAsUtc - offset).toISOString();
}

function generateDates(
  startDate: string,
  endDate: string,
  weekdays: number[],
  excludedRanges: Array<{ startDate: string; endDate: string }>,
  requestedFrom: string,
  requestedTo: string,
): string[] {
  const start = startDate > requestedFrom ? startDate : requestedFrom;
  const end = endDate < requestedTo ? endDate : requestedTo;
  if (start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const stop = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= stop) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    const excluded = excludedRanges.some(
      (range) => date >= range.startDate && date <= range.endDate,
    );
    if (!excluded && weekdays.includes(weekday)) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function findConflicts(input: {
  startAt: string;
  endAt: string;
  vehicleId?: string | null;
  driverId?: string | null;
  passengerCount: number;
  excludeTransportId?: string;
}) {
  const conflicts: string[] = [];
  let capacityExceeded = false;
  const vehicleId = input.vehicleId || undefined;
  const driverId = input.driverId || undefined;

  if (vehicleId) {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    if (!vehicle) conflicts.push("Véhicule introuvable.");
    else {
      if (!vehicle.active) conflicts.push("Le véhicule est inactif.");
      if (input.passengerCount > vehicle.capacity) {
        capacityExceeded = true;
        conflicts.push(`Le véhicule ne peut accueillir que ${vehicle.capacity} passagers.`);
      }
      if (
        vehicle.unavailableIntervals.some((range) =>
          overlaps(input.startAt, input.endAt, range.startAt, range.endAt),
        )
      ) {
        conflicts.push("Le véhicule est indisponible sur ce créneau.");
      }
    }
  }

  if (driverId) {
    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    if (!driver) conflicts.push("Chauffeur introuvable.");
    else {
      if (!driver.active) conflicts.push("Le chauffeur est inactif.");
      if (
        driver.unavailableIntervals.some((range) =>
          overlaps(input.startAt, input.endAt, range.startAt, range.endAt),
        )
      ) {
        conflicts.push("Le chauffeur est indisponible sur ce créneau.");
      }
    }
  }

  const resourceConditions = [];
  if (vehicleId) resourceConditions.push(eq(transports.vehicleId, vehicleId));
  if (driverId) resourceConditions.push(eq(transports.driverId, driverId));
  if (resourceConditions.length) {
    const overlapConditions = [
      lt(transports.startAt, input.endAt),
      gt(transports.endAt, input.startAt),
      ne(transports.status, "cancelled"),
      or(...resourceConditions)!,
    ];
    if (input.excludeTransportId) {
      overlapConditions.push(ne(transports.id, input.excludeTransportId));
    }
    const scheduled = await db
      .select()
      .from(transports)
      .where(and(...overlapConditions));
    for (const row of scheduled) {
      if (vehicleId && row.vehicleId === vehicleId) {
        conflicts.push(`Le véhicule est déjà affecté au transport ${row.reference}.`);
      }
      if (driverId && row.driverId === driverId) {
        conflicts.push(`Le chauffeur est déjà affecté au transport ${row.reference}.`);
      }
    }
  }
  return { conflicts, capacityExceeded };
}

router.get("/transports", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  try {
    const rows = await db
      .select()
      .from(transports)
      .where(
        from && to
          ? and(gte(transports.startAt, `${from}T00:00:00.000Z`), lt(transports.startAt, `${to}T23:59:59.999Z`))
          : from
            ? gte(transports.startAt, `${from}T00:00:00.000Z`)
            : to
              ? lt(transports.startAt, `${to}T23:59:59.999Z`)
              : undefined,
      )
      .orderBy(transports.startAt);
    res.json(
      api.ListTransportsResponse.parse(
        rows.map((row) => ({
          ...row,
          notes: row.notes ?? undefined,
        })),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Transports could not be loaded");
    res.status(500).json({ error: "Le planning des transports est indisponible." });
  }
});

router.post("/transports", async (req, res): Promise<void> => {
  const parsed = api.CreateTransportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations du transport." });
    return;
  }
  const input = parsed.data;
  const startAt = toIso(input.startAt)!;
  const endAt = toIso(input.endAt)!;
  if (Date.parse(startAt) >= Date.parse(endAt)) {
    res.status(400).json({ error: "L’heure de fin doit suivre l’heure de départ." });
    return;
  }
  try {
    const check = await findConflicts({
      startAt,
      endAt,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      passengerCount: input.passengerCount,
    });
    if (check.conflicts.length) {
      res.status(409).json({ error: check.conflicts.join(" ") });
      return;
    }
    const id = randomUUID();
    const [created] = await db
      .insert(transports)
      .values({
        id,
        reference: makeReference(id),
        clientId: input.clientId ?? null,
        clientName: input.clientName.trim(),
        startAt,
        endAt,
        pickupAddress: input.pickupAddress.trim(),
        destination: input.destination.trim(),
        passengerCount: input.passengerCount,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning();
    await recordActivity(`Transport planifié : ${created.reference}`);
    res.status(201).json(
      api.CreateTransportResponse.parse({
        ...created,
        notes: created.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Transport could not be created");
    res.status(500).json({ error: "Le transport n’a pas pu être enregistré." });
  }
});

router.patch("/transports/:id", async (req, res): Promise<void> => {
  const params = api.UpdateTransportParams.safeParse(req.params);
  const body = api.UpdateTransportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications du transport." });
    return;
  }
  try {
    const [current] = await db
      .select()
      .from(transports)
      .where(eq(transports.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Transport introuvable." });
      return;
    }
    const candidate = {
      startAt: toIso(body.data.startAt) ?? current.startAt,
      endAt: toIso(body.data.endAt) ?? current.endAt,
      vehicleId: body.data.vehicleId === undefined ? current.vehicleId : body.data.vehicleId,
      driverId: body.data.driverId === undefined ? current.driverId : body.data.driverId,
      passengerCount: current.passengerCount,
      excludeTransportId: current.id,
    };
    if (Date.parse(candidate.startAt) >= Date.parse(candidate.endAt)) {
      res.status(400).json({ error: "L’heure de fin doit suivre l’heure de départ." });
      return;
    }
    if (body.data.status !== "cancelled") {
      const check = await findConflicts(candidate);
      if (check.conflicts.length) {
        res.status(409).json({ error: check.conflicts.join(" ") });
        return;
      }
    }
    const [updated] = await db
      .update(transports)
      .set({
        ...(body.data.startAt !== undefined && { startAt: candidate.startAt }),
        ...(body.data.endAt !== undefined && { endAt: candidate.endAt }),
        ...(body.data.vehicleId !== undefined && { vehicleId: candidate.vehicleId }),
        ...(body.data.driverId !== undefined && { driverId: candidate.driverId }),
        ...(body.data.status !== undefined && { status: body.data.status }),
        ...(body.data.notes !== undefined && { notes: body.data.notes }),
      })
      .where(eq(transports.id, current.id))
      .returning();
    res.json(
      api.UpdateTransportResponse.parse({
        ...updated,
        notes: updated.notes ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Transport could not be updated");
    res.status(500).json({ error: "Le transport n’a pas pu être modifié." });
  }
});

router.post("/schedule/conflicts", async (req, res): Promise<void> => {
  const parsed = api.CheckScheduleConflictsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez le créneau et les affectations." });
    return;
  }
  try {
    const input = parsed.data;
    const result = await findConflicts({
      startAt: toIso(input.startAt)!,
      endAt: toIso(input.endAt)!,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      passengerCount: input.passengerCount,
      excludeTransportId: input.excludeTransportId,
    });
    res.json(api.CheckScheduleConflictsResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Schedule conflict check failed");
    res.status(500).json({ error: "La vérification des affectations a échoué." });
  }
});

router.get("/schedule/occurrences", async (req, res): Promise<void> => {
  const parsed = api.ListScheduleOccurrencesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Période de planning invalide." });
    return;
  }
  const from = dateValue(parsed.data.from);
  const to = dateValue(parsed.data.to);
  if (from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
    res.status(400).json({ error: "La période doit être comprise entre un jour et un an." });
    return;
  }
  try {
    const actual = await db
      .select()
      .from(transports)
      .where(
        and(
          lt(transports.startAt, `${to}T23:59:59.999Z`),
          gt(transports.endAt, `${from}T00:00:00.000Z`),
          ne(transports.status, "cancelled"),
        ),
      );
    const routes = await db
      .select()
      .from(recurringRoutes)
      .where(eq(recurringRoutes.active, true));
    const occurrences = routes.flatMap((route) =>
      generateDates(
        route.startDate,
        route.endDate,
        route.weekdays,
        route.excludedRanges,
        from,
        to,
      ).map((day) => ({
        id: `recurring:${route.id}:${day}`,
        kind: "recurring" as const,
        title: route.name,
        startAt: localBrusselsDateTimeToIso(day, route.startTime),
        endAt: localBrusselsDateTimeToIso(day, route.endTime),
        pickupAddress: route.pickupAddress,
        destination: route.destination,
        passengerCount: route.passengerCount,
        vehicleId: route.vehicleId,
        driverId: route.driverId,
      })),
    );
    const events = [
      ...actual.map((row) => ({
        id: row.id,
        kind: "transport" as const,
        title: row.clientName,
        startAt: row.startAt,
        endAt: row.endAt,
        pickupAddress: row.pickupAddress,
        destination: row.destination,
        passengerCount: row.passengerCount,
        vehicleId: row.vehicleId,
        driverId: row.driverId,
      })),
      ...occurrences,
    ].sort((a, b) => a.startAt.localeCompare(b.startAt));
    res.json(api.ListScheduleOccurrencesResponse.parse(events));
  } catch (error) {
    req.log.error({ err: error }, "Schedule occurrences could not be loaded");
    res.status(500).json({ error: "Le planning est indisponible." });
  }
});

router.get("/transports/:id/mission-sheet", async (req, res): Promise<void> => {
  const params = api.GetMissionSheetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de transport invalide." });
    return;
  }
  try {
    const [row] = await db
      .select({
        transport: transports,
        vehicleName: vehicles.name,
        registration: vehicles.registration,
        driverName: drivers.name,
      })
      .from(transports)
      .leftJoin(vehicles, eq(transports.vehicleId, vehicles.id))
      .leftJoin(drivers, eq(transports.driverId, drivers.id))
      .where(eq(transports.id, params.data.id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Transport introuvable." });
      return;
    }
    res.json(
      api.GetMissionSheetResponse.parse({
        reference: row.transport.reference,
        clientName: row.transport.clientName,
        startAt: row.transport.startAt,
        endAt: row.transport.endAt,
        pickupAddress: row.transport.pickupAddress,
        destination: row.transport.destination,
        passengerCount: row.transport.passengerCount,
        vehicleName: row.vehicleName,
        registration: row.registration,
        driverName: row.driverName,
        notes: row.transport.notes,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Mission sheet could not be loaded");
    res.status(500).json({ error: "La fiche de mission est indisponible." });
  }
});

router.get("/recurring-routes", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(recurringRoutes)
      .orderBy(recurringRoutes.name);
    res.json(api.ListRecurringRoutesResponse.parse(rows));
  } catch (error) {
    req.log.error({ err: error }, "Recurring routes could not be loaded");
    res.status(500).json({ error: "Les trajets récurrents sont indisponibles." });
  }
});

router.post("/recurring-routes", async (req, res): Promise<void> => {
  const parsed = api.CreateRecurringRouteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations du trajet récurrent." });
    return;
  }
  const input = parsed.data;
  const startDate = dateValue(input.startDate);
  const endDate = dateValue(input.endDate);
  if (startDate > endDate || input.startTime >= input.endTime) {
    res.status(400).json({ error: "La période ou les horaires du trajet sont invalides." });
    return;
  }
  try {
    const [created] = await db
      .insert(recurringRoutes)
      .values({
        name: input.name.trim(),
        clientName: input.clientName.trim(),
        startDate,
        endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        weekdays: input.weekdays,
        pickupAddress: input.pickupAddress.trim(),
        destination: input.destination.trim(),
        passengerCount: input.passengerCount,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        excludedRanges:
          input.excludedRanges?.map((range) => ({
            startDate: dateValue(range.startDate),
            endDate: dateValue(range.endDate),
          })) ?? [],
      })
      .returning();
    await recordActivity(`Trajet récurrent ajouté : ${created.name}`);
    res.status(201).json(api.CreateRecurringRouteResponse.parse(created));
  } catch (error) {
    req.log.error({ err: error }, "Recurring route could not be created");
    res.status(500).json({ error: "Le trajet récurrent n’a pas pu être enregistré." });
  }
});

router.patch("/recurring-routes/:id", async (req, res): Promise<void> => {
  const params = api.UpdateRecurringRouteParams.safeParse(req.params);
  const body = api.UpdateRecurringRouteBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications du trajet récurrent." });
    return;
  }
  try {
    const current = await db
      .select()
      .from(recurringRoutes)
      .where(eq(recurringRoutes.id, params.data.id))
      .limit(1);
    if (!current[0]) {
      res.status(404).json({ error: "Trajet récurrent introuvable." });
      return;
    }
    const input = body.data;
    const startDate = input.startDate ? dateValue(input.startDate) : current[0].startDate;
    const endDate = input.endDate ? dateValue(input.endDate) : current[0].endDate;
    const startTime = input.startTime ?? current[0].startTime;
    const endTime = input.endTime ?? current[0].endTime;
    if (startDate > endDate || startTime >= endTime) {
      res.status(400).json({ error: "La période ou les horaires du trajet sont invalides." });
      return;
    }
    const [updated] = await db
      .update(recurringRoutes)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.clientName !== undefined && { clientName: input.clientName.trim() }),
        ...(input.startDate !== undefined && { startDate }),
        ...(input.endDate !== undefined && { endDate }),
        ...(input.startTime !== undefined && { startTime }),
        ...(input.endTime !== undefined && { endTime }),
        ...(input.weekdays !== undefined && { weekdays: input.weekdays }),
        ...(input.pickupAddress !== undefined && { pickupAddress: input.pickupAddress.trim() }),
        ...(input.destination !== undefined && { destination: input.destination.trim() }),
        ...(input.passengerCount !== undefined && { passengerCount: input.passengerCount }),
        ...(input.vehicleId !== undefined && { vehicleId: input.vehicleId }),
        ...(input.driverId !== undefined && { driverId: input.driverId }),
        ...(input.excludedRanges !== undefined && {
          excludedRanges: input.excludedRanges.map((range) => ({
            startDate: dateValue(range.startDate),
            endDate: dateValue(range.endDate),
          })),
        }),
        ...(input.active !== undefined && { active: input.active }),
      })
      .where(eq(recurringRoutes.id, params.data.id))
      .returning();
    res.json(api.UpdateRecurringRouteResponse.parse(updated));
  } catch (error) {
    req.log.error({ err: error }, "Recurring route could not be updated");
    res.status(500).json({ error: "Le trajet récurrent n’a pas pu être modifié." });
  }
});

router.get("/vehicles", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(vehicles).orderBy(vehicles.name);
    res.json(api.ListVehiclesResponse.parse(rows));
  } catch (error) {
    req.log.error({ err: error }, "Vehicles could not be loaded");
    res.status(500).json({ error: "La liste des véhicules est indisponible." });
  }
});

router.post("/vehicles", async (req, res): Promise<void> => {
  const parsed = api.CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations du véhicule." });
    return;
  }
  try {
    const [created] = await db
      .insert(vehicles)
      .values({
        name: parsed.data.name.trim(),
        registration: parsed.data.registration.trim().toUpperCase(),
        capacity: parsed.data.capacity,
        equipment: parsed.data.equipment ?? [],
        unavailableIntervals:
          parsed.data.unavailableIntervals?.map((range) => ({
            startAt: toIso(range.startAt)!,
            endAt: toIso(range.endAt)!,
          })) ?? [],
      })
      .returning();
    await recordActivity(`Véhicule ajouté : ${created.name}`);
    res.status(201).json(api.CreateVehicleResponse.parse(created));
  } catch (error) {
    req.log.error({ err: error }, "Vehicle could not be created");
    res.status(500).json({ error: "Le véhicule n’a pas pu être enregistré." });
  }
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  const params = api.UpdateVehicleParams.safeParse(req.params);
  const body = api.UpdateVehicleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications du véhicule." });
    return;
  }
  try {
    const input = body.data;
    const assigned = await db
      .select()
      .from(transports)
      .where(
        and(
          eq(transports.vehicleId, params.data.id),
          ne(transports.status, "cancelled"),
          gt(transports.endAt, new Date().toISOString()),
        ),
      );
    if (body.data.capacity !== undefined) {
      if (assigned.some((transport) => transport.passengerCount > body.data.capacity!)) {
        res.status(409).json({ error: "La capacité ne peut pas être réduite sous le nombre de passagers d’un transport planifié." });
        return;
      }
    }
    if (input.active === false && assigned.length) {
      res.status(409).json({ error: "Déplacez ou annulez les transports à venir avant de désactiver ce véhicule." });
      return;
    }
    const unavailable = input.unavailableIntervals?.map((range) => ({
      startAt: toIso(range.startAt)!,
      endAt: toIso(range.endAt)!,
    }));
    if (unavailable?.some((range) => Date.parse(range.startAt) >= Date.parse(range.endAt))) {
      res.status(400).json({ error: "Une période d’indisponibilité est invalide." });
      return;
    }
    if (unavailable?.some((range) => assigned.some((transport) =>
      overlaps(range.startAt, range.endAt, transport.startAt, transport.endAt),
    ))) {
      res.status(409).json({ error: "Une indisponibilité chevauche un transport déjà planifié." });
      return;
    }
    const [updated] = await db
      .update(vehicles)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.registration !== undefined && { registration: input.registration.trim().toUpperCase() }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        ...(input.equipment !== undefined && { equipment: input.equipment }),
        ...(unavailable !== undefined && { unavailableIntervals: unavailable }),
        ...(input.active !== undefined && { active: input.active }),
      })
      .where(eq(vehicles.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Véhicule introuvable." });
      return;
    }
    res.json(api.UpdateVehicleResponse.parse(updated));
  } catch (error) {
    req.log.error({ err: error }, "Vehicle could not be updated");
    res.status(500).json({ error: "Le véhicule n’a pas pu être modifié." });
  }
});

router.get("/drivers", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(drivers).orderBy(drivers.name);
    res.json(api.ListDriversResponse.parse(rows));
  } catch (error) {
    req.log.error({ err: error }, "Drivers could not be loaded");
    res.status(500).json({ error: "La liste des chauffeurs est indisponible." });
  }
});

router.post("/drivers", async (req, res): Promise<void> => {
  const parsed = api.CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les coordonnées du chauffeur." });
    return;
  }
  try {
    const [created] = await db
      .insert(drivers)
      .values({
        name: parsed.data.name.trim(),
        phone: parsed.data.phone.trim(),
        email: parsed.data.email?.trim() || null,
        unavailableIntervals:
          parsed.data.unavailableIntervals?.map((range) => ({
            startAt: toIso(range.startAt)!,
            endAt: toIso(range.endAt)!,
          })) ?? [],
      })
      .returning();
    res.status(201).json(
      api.CreateDriverResponse.parse({
        ...created,
        email: created.email ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Driver could not be created");
    res.status(500).json({ error: "Le chauffeur n’a pas pu être enregistré." });
  }
});

router.patch("/drivers/:id", async (req, res): Promise<void> => {
  const params = api.UpdateDriverParams.safeParse(req.params);
  const body = api.UpdateDriverBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications du chauffeur." });
    return;
  }
  try {
    const input = body.data;
    const assigned = await db
      .select()
      .from(transports)
      .where(
        and(
          eq(transports.driverId, params.data.id),
          ne(transports.status, "cancelled"),
          gt(transports.endAt, new Date().toISOString()),
        ),
      );
    if (input.active === false && assigned.length) {
      res.status(409).json({ error: "Déplacez ou annulez les transports à venir avant de désactiver ce chauffeur." });
      return;
    }
    const unavailable = input.unavailableIntervals?.map((range) => ({
      startAt: toIso(range.startAt)!,
      endAt: toIso(range.endAt)!,
    }));
    if (unavailable?.some((range) => Date.parse(range.startAt) >= Date.parse(range.endAt))) {
      res.status(400).json({ error: "Une période d’indisponibilité est invalide." });
      return;
    }
    if (unavailable?.some((range) => assigned.some((transport) =>
      overlaps(range.startAt, range.endAt, transport.startAt, transport.endAt),
    ))) {
      res.status(409).json({ error: "Une indisponibilité chevauche un transport déjà planifié." });
      return;
    }
    const [updated] = await db
      .update(drivers)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.phone !== undefined && { phone: input.phone.trim() }),
        ...(input.email !== undefined && { email: input.email?.trim() || null }),
        ...(unavailable !== undefined && { unavailableIntervals: unavailable }),
        ...(input.active !== undefined && { active: input.active }),
      })
      .where(eq(drivers.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Chauffeur introuvable." });
      return;
    }
    res.json(
      api.UpdateDriverResponse.parse({
        ...updated,
        email: updated.email ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Driver could not be updated");
    res.status(500).json({ error: "Le chauffeur n’a pas pu être modifié." });
  }
});

export default router;
