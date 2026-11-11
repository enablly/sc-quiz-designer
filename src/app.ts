import express from "express";
import type { AppConfig } from "./config.js";
import { createAdminRouter } from "./routes/admin.js";
import { createPublicRouter } from "./routes/public.js";
import type { QuizStore } from "./store/store.js";

export interface AppDeps {
  store: QuizStore;
  config: AppConfig;
  fetchFn?: typeof fetch;
  onAsyncSync?: (p: Promise<unknown>) => void;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));

  // Allow standalone HTML exports hosted on other origins to POST to the public submit API
  app.use("/api/quizzes", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(
    createPublicRouter({
      store: deps.store,
      config: deps.config,
      fetchFn: deps.fetchFn,
      onAsyncSync: deps.onAsyncSync,
    }),
  );

  app.use(
    createAdminRouter({
      store: deps.store,
      config: deps.config,
      fetchFn: deps.fetchFn,
    }),
  );

  return app;
}
