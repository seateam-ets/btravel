import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, staffUsers } from "@workspace/db";

// Adresses autorisées à devenir responsable, définies dans le secret Replit ADMIN_EMAILS
// (séparées par des virgules). Seules des adresses vérifiées par Clerk sont acceptées.
function allowedAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function provisionManager(userId: string): Promise<boolean> {
  const allowed = allowedAdminEmails();
  if (!allowed.length) return false;
  const user = await clerkClient.users.getUser(userId);
  const match = user.emailAddresses.find(
    (address) =>
      address.verification?.status === "verified" &&
      allowed.includes(address.emailAddress.toLowerCase()),
  );
  if (!match) return false;
  await db
    .insert(staffUsers)
    .values({ clerkUserId: userId, email: match.emailAddress.toLowerCase(), role: "manager" })
    .onConflictDoNothing();
  return true;
}

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

    if (staff?.role === "manager" || (!staff && (await provisionManager(userId)))) {
      next();
      return;
    }
    res.status(403).json({ error: "Cet espace est réservé à la responsable." });
  } catch (error) {
    req.log.error({ err: error }, "Manager authorization check failed");
    res.status(500).json({ error: "Vérification de l’accès impossible." });
  }
}
