import { count } from "drizzle-orm";
import { db, vehicles } from "@workspace/db";
import { logger } from "./logger";

// Les 13 modèles présentés sur b-travel.be. Les immatriculations ne sont pas publiques :
// elles sont marquées « À compléter » et la capacité correspond au maximum indicatif de la
// catégorie, à corriger par la responsable dans Paramètres → Véhicules.
const FLEET: { name: string; capacity: number; equipment: string[] }[] = [
  { name: "Néoplan Skyliner", capacity: 83, equipment: ["Double étage"] },
  { name: "Setra 531", capacity: 83, equipment: ["Double étage"] },
  { name: "Mercedes Travego", capacity: 57, equipment: ["Grand tourisme"] },
  { name: "MAN Lion’s", capacity: 57, equipment: ["Grand tourisme"] },
  { name: "Yutong GT 12", capacity: 57, equipment: ["Grand tourisme"] },
  { name: "Iveco Crossway", capacity: 60, equipment: ["Autocar scolaire"] },
  { name: "Mercedes Intouro", capacity: 60, equipment: ["Autocar scolaire"] },
  { name: "Otokar Navigo", capacity: 35, equipment: ["Midicar"] },
  { name: "Wing", capacity: 35, equipment: ["Midicar"] },
  { name: "Mercedes Atego", capacity: 35, equipment: ["Midicar"] },
  { name: "Iveco", capacity: 19, equipment: ["Minibus"] },
  { name: "Sprinter", capacity: 19, equipment: ["Minibus"] },
  { name: "Ford", capacity: 19, equipment: ["Minibus"] },
];

export async function seedFleetIfEmpty(): Promise<void> {
  try {
    const [{ total }] = await db.select({ total: count() }).from(vehicles);
    if (total > 0) return;
    await db
      .insert(vehicles)
      .values(FLEET.map((model) => ({ ...model, registration: `À compléter – ${model.name}` })))
      .onConflictDoNothing();
    logger.info({ count: FLEET.length }, "Flotte B-TRAVEL initialisée");
  } catch (error) {
    logger.error({ err: error }, "Initialisation de la flotte impossible");
  }
}
