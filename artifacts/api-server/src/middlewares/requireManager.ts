import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, staffUsers } from "@workspace/db";

export async function requireManager(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Connexion requise." });
    return;
  }

  try {
    const [staff] = await db
      .select({ role: staffUsers.role })
      .from(staffUsers)
      .where(eq(staffUsers.clerkUserId, userId))
      .limit(1);

    if (staff?.role !== "manager") {
      res.status(403).json({ error: "Cet espace est réservé à la responsable." });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ err: error }, "Manager authorization check failed");
    res.status(500).json({ error: "Vérification de l’accès impossible." });
  }
}
