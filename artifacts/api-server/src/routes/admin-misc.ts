import { and, desc, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as api from "@workspace/api-zod";
import { getAuth } from "@clerk/express";
import { db, adminTasks, contactMessages, documents, invoices, trips, transports, quoteRequests, tripRequests } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { setObjectAclPolicy, ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();

function contactResponse(row: typeof contactMessages.$inferSelect) {
  return {
    ...row,
    phone: row.phone ?? undefined,
    subject: row.subject ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

router.get("/contact-messages", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
    res.json(api.ListContactMessagesResponse.parse(rows.map(contactResponse)));
  } catch (error) {
    req.log.error({ err: error }, "Contact messages could not be loaded");
    res.status(500).json({ error: "Les demandes de contact sont indisponibles." });
  }
});

router.patch("/contact-messages/:id/status", async (req, res): Promise<void> => {
  const params = api.UpdateContactMessageStatusParams.safeParse(req.params);
  const body = api.UpdateContactMessageStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Statut invalide." });
    return;
  }
  try {
    const [updated] = await db
      .update(contactMessages)
      .set({ status: body.data.status })
      .where(eq(contactMessages.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Demande de contact introuvable." });
      return;
    }
    res.json(api.UpdateContactMessageStatusResponse.parse(contactResponse(updated)));
  } catch (error) {
    req.log.error({ err: error }, "Contact message status could not be updated");
    res.status(500).json({ error: "Le statut n’a pas pu être modifié." });
  }
});
const storage = new ObjectStorageService();
const acceptedContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maximumDocumentBytes = 25_000_000;

function asIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

router.get("/tasks", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(adminTasks).orderBy(adminTasks.dueAt);
    res.json(
      api.ListTasksResponse.parse(
        rows.map((row) => ({
          ...row,
          dueAt: row.dueAt ?? undefined,
          category: row.category ?? undefined,
        })),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Tasks could not be loaded");
    res.status(500).json({ error: "Les tâches sont indisponibles." });
  }
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = api.CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez le libellé de la tâche." });
    return;
  }
  try {
    const [created] = await db
      .insert(adminTasks)
      .values({
        title: parsed.data.title.trim(),
        dueAt: asIso(parsed.data.dueAt) ?? null,
        category: parsed.data.category?.trim() || null,
      })
      .returning();
    res.status(201).json(
      api.CreateTaskResponse.parse({
        ...created,
        dueAt: created.dueAt ?? undefined,
        category: created.category ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Task could not be created");
    res.status(500).json({ error: "La tâche n’a pas pu être enregistrée." });
  }
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = api.UpdateTaskParams.safeParse(req.params);
  const body = api.UpdateTaskBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Vérifiez les modifications de la tâche." });
    return;
  }
  try {
    const input = body.data;
    const [updated] = await db
      .update(adminTasks)
      .set({
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.dueAt !== undefined && { dueAt: asIso(input.dueAt) ?? null }),
        ...(input.completed !== undefined && { completed: input.completed }),
        ...(input.category !== undefined && { category: input.category?.trim() || null }),
      })
      .where(eq(adminTasks.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Tâche introuvable." });
      return;
    }
    res.json(
      api.UpdateTaskResponse.parse({
        ...updated,
        dueAt: updated.dueAt ?? undefined,
        category: updated.category ?? undefined,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Task could not be updated");
    res.status(500).json({ error: "La tâche n’a pas pu être modifiée." });
  }
});

router.get("/documents", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));
    res.json(api.ListDocumentsResponse.parse(rows));
  } catch (error) {
    req.log.error({ err: error }, "Documents could not be loaded");
    res.status(500).json({ error: "Les documents sont indisponibles." });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  const parsed = api.CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vérifiez les informations du document." });
    return;
  }
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Connexion requise." });
    return;
  }
  const input = parsed.data;
  if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(input.objectPath)) {
    res.status(400).json({ error: "Le chemin du document est invalide." });
    return;
  }
  const allowedEntities = new Set([
    "client",
    "quote_request",
    "quote",
    "transport",
    "trip",
    "trip_request",
    "invoice",
  ]);
  if (!allowedEntities.has(input.entityType)) {
    res.status(400).json({ error: "Le type de dossier associé est invalide." });
    return;
  }
  try {
    const objectFile = await storage.getObjectEntityFile(input.objectPath);
    const [metadata] = await objectFile.getMetadata();
    const size = Number(metadata.size ?? 0);
    const contentType = String(metadata.contentType ?? "");
    if (size <= 0 || size > maximumDocumentBytes || !acceptedContentTypes.has(contentType)) {
      await objectFile.delete().catch(() => undefined);
      res.status(400).json({ error: "Le fichier doit être un PDF ou une image autorisée de 25 Mo maximum." });
      return;
    }
    await setObjectAclPolicy(objectFile, {
      owner: userId,
      visibility: "private",
    });
    const [created] = await db
      .insert(documents)
      .values({
        name: input.name.trim().slice(0, 180),
        objectPath: input.objectPath,
        entityType: input.entityType,
        entityId: input.entityId,
        ownerId: userId,
      })
      .returning();
    res.status(201).json(api.CreateDocumentResponse.parse(created));
  } catch (error) {
    req.log.error({ err: error }, "Document metadata could not be saved");
    res.status(500).json({ error: "Le document n’a pas pu être enregistré." });
  }
});

export default router;
