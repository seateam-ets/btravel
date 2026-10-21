import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

// Filet de sécurité : crée les tables ajoutées récemment si `drizzle-kit push`
// n'a pas encore été lancé sur la base (dev ou production Replit).
export async function ensureSchema(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS btravel_contact_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference text NOT NULL UNIQUE,
        name text NOT NULL,
        email text NOT NULL,
        phone text,
        subject text,
        message text NOT NULL,
        status text NOT NULL DEFAULT 'new',
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS btravel_contact_messages_status_idx ON btravel_contact_messages (status)`);
  } catch (error) {
    logger.error({ err: error }, "Vérification du schéma impossible");
  }
}
