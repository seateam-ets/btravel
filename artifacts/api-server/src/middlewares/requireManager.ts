import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, staffUsers } from "@workspace/db";

// Adresses autorisées à devenir responsable, définies dans le secret Replit ADMIN_EMAILS
// (séparées par des virgules). Seules des adresses vérifiées par Clerk sont acceptées.
function allowedAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((email) => email.replace(/["'<>]/g, "").trim().toLowerCase())
    .filter(Boolean);
}

type Provisioning = "granted" | "no-admin-emails" | "email-not-listed" | "email-not-verified";

async function provisionManager(userId: string): Promise<Provisioning> {
  const allowed = allowedAdminEmails();
  if (!allowed.length) return "no-admin-emails";
  const user = await clerkClient.users.getUser(userId);
  const listed = user.emailAddresses.filter((address) => allowed.includes(address.emailAddress.trim().toLowerCase()));
  if (!listed.length) return "email-not-listed";
  const match = listed.find((address) => address.verification?.status === "verified");
  if (!match) return "email-not-verified";
  await db
    .insert(staffUsers)
    .values({ clerkUserId: userId, email: match.emailAddress.toLowerCase(), role: "manager" })
    .onConflictDoNothing();
  return "granted";
}

const refusalMessages: Record<Exclude<Provisioning, "granted">, string> = {
  "no-admin-emails": "Le secret ADMIN_EMAILS n’est pas visible par le serveur. Redémarrez l’application (ou ajoutez-le aussi aux secrets du déploiement).",
  "email-not-listed": "Cette adresse e-mail ne figure pas dans le secret ADMIN_EMAILS.",
  "email-not-verified": "Cette adresse e-mail n’a pas encore été vérifiée. Validez le code reçu par e-mail puis reconnectez-vous.",
};

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

    if (staff?.role === "manager") {
      next();
      return;
    }
    const outcome = staff ? "email-not-listed" : await provisionManager(userId);
    if (outcome === "granted") {
      next();
      return;
    }
    req.log.warn({ outcome }, "Admin access refused");
    res.status(403).json({ error: refusalMessages[outcome], reason: outcome });
  } catch (error) {
    req.log.error({ err: error }, "Manager authorization check failed");
    res.status(500).json({ error: "Vérification de l’accès impossible." });
  }
}
