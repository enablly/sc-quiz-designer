import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateQuizDefinition } from "../domain/validator.js";
import type { QuizStore } from "../store/store.js";
import type { QuizDefinition } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveSeedPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "seed/seed-hybrid-meeting-readiness.json"),
    path.resolve(__dirname, "../../seed/seed-hybrid-meeting-readiness.json"),
    path.resolve(__dirname, "../../../seed/seed-hybrid-meeting-readiness.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function loadSeedDefinition(): QuizDefinition {
  const seedPath = resolveSeedPath();
  const raw = JSON.parse(fs.readFileSync(seedPath, "utf8")) as unknown;
  const check = validateQuizDefinition(raw);
  if (!check.valid || !check.normalized) {
    throw new Error(`Invalid seed definition: ${check.errors.join("; ")}`);
  }
  return check.normalized;
}

export async function ensureSeedImported(store: QuizStore): Promise<boolean> {
  const seed = loadSeedDefinition();
  const existing = await store.getQuiz(seed.slug);
  if (existing) return false;
  await store.saveQuiz(seed, "Initial seed import");
  return true;
}
