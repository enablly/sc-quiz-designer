import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureSeedImported } from "./services/seed-loader.js";
import { FirestoreStore } from "./store/firestore-store.js";
import { MemoryStore } from "./store/memory-store.js";

async function main() {
  const config = loadConfig();
  const store = config.useMemoryStore
    ? new MemoryStore()
    : new FirestoreStore(config.googleCloudProject || undefined);

  if (config.useMemoryStore) {
    console.warn(
      "[sc-quiz-designer] Running with in-memory store (set GOOGLE_CLOUD_PROJECT to use Firestore).",
    );
  }

  try {
    const imported = await ensureSeedImported(store);
    if (imported) {
      console.log("[sc-quiz-designer] Imported seed quiz 'hybrid-meeting-readiness' as draft.");
    }
  } catch (err) {
    console.error("[sc-quiz-designer] Failed to import seed quiz:", err);
  }

  const app = createApp({ store, config });
  app.listen(config.port, () => {
    console.log(`[sc-quiz-designer] Listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error("[sc-quiz-designer] Fatal startup error:", err);
  process.exit(1);
});
