import { Router } from "express";
import type { AppConfig } from "../config.js";
import { buildSubmissionsCsv } from "../domain/csv.js";
import { validateQuizDefinition } from "../domain/validator.js";
import { renderAdminBuilderHtml, renderAdminLoginHtml } from "../render/admin-html.js";
import { renderQuizHtml } from "../render/quiz-html.js";
import { runRetrySweep } from "../services/sync-pipeline.js";
import type { QuizStore } from "../store/store.js";
import type { QuizDefinition } from "../types.js";
import {
  clearAdminSessionCookie,
  isAdminAuthenticated,
  requireAdminAuth,
  setAdminSessionCookie,
} from "./auth.js";

export interface AdminRouterDeps {
  store: QuizStore;
  config: AppConfig;
  fetchFn?: typeof fetch;
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();
  const fetchFn = deps.fetchFn ?? fetch;
  const authMiddleware = requireAdminAuth(deps.config.adminToken);

  router.get("/admin/login", (req, res) => {
    if (isAdminAuthenticated(req, deps.config.adminToken)) {
      res.redirect("/admin");
      return;
    }
    const err = req.query.err ? "Invalid admin token." : undefined;
    res.type("html").send(renderAdminLoginHtml(err));
  });

  router.get("/admin", (req, res) => {
    if (!isAdminAuthenticated(req, deps.config.adminToken)) {
      res.redirect("/admin/login");
      return;
    }
    res.type("html").send(renderAdminBuilderHtml());
  });

  router.post("/api/admin/login", (req, res) => {
    const token = String((req.body as Record<string, unknown>)?.token ?? "").trim();
    if (!deps.config.adminToken || token !== deps.config.adminToken) {
      if (req.headers.accept?.includes("application/json")) {
        res.status(401).json({ error: "Invalid admin token." });
      } else {
        res.redirect("/admin/login?err=1");
      }
      return;
    }
    setAdminSessionCookie(req, res, deps.config.adminToken);
    if (req.headers.accept?.includes("application/json")) {
      res.json({ ok: true });
    } else {
      res.redirect("/admin");
    }
  });

  router.post("/api/admin/logout", (_req, res) => {
    clearAdminSessionCookie(res);
    res.json({ ok: true });
  });

  // Protected admin APIs
  router.use("/api/admin", authMiddleware);

  router.get("/api/admin/quizzes", async (_req, res) => {
    const list = await deps.store.listQuizzes();
    res.json(list);
  });

  router.get("/api/admin/quizzes/:slug", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    res.json(quiz);
  });

  router.post("/api/admin/quizzes", async (req, res) => {
    const check = validateQuizDefinition(req.body);
    if (!check.valid || !check.normalized) {
      res.status(400).json({ errors: check.errors });
      return;
    }
    const existing = await deps.store.getQuiz(check.normalized.slug);
    if (existing) {
      res.status(409).json({ error: `Quiz with slug '${check.normalized.slug}' already exists.` });
      return;
    }
    const rev = await deps.store.saveQuiz(check.normalized, "Created");
    res.status(201).json(rev.definition);
  });

  router.post("/api/admin/quizzes/import", async (req, res) => {
    const check = validateQuizDefinition(req.body);
    if (!check.valid || !check.normalized) {
      res.status(400).json({ errors: check.errors });
      return;
    }
    const rev = await deps.store.saveQuiz(check.normalized, "Imported JSON");
    res.status(201).json(rev.definition);
  });

  router.put("/api/admin/quizzes/:slug", async (req, res) => {
    const check = validateQuizDefinition(req.body);
    if (!check.valid || !check.normalized) {
      res.status(400).json({ errors: check.errors });
      return;
    }
    const oldSlug = req.params.slug;
    const newSlug = check.normalized.slug;
    if (oldSlug !== newSlug) {
      const collision = await deps.store.getQuiz(newSlug);
      if (collision) {
        res.status(409).json({ error: `Cannot rename: slug '${newSlug}' already exists.` });
        return;
      }
      await deps.store.deleteQuiz(oldSlug);
    }
    const rev = await deps.store.saveQuiz(check.normalized, "Saved from builder");
    res.json(rev.definition);
  });

  router.delete("/api/admin/quizzes/:slug", async (req, res) => {
    const deleted = await deps.store.deleteQuiz(req.params.slug);
    if (!deleted) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/api/admin/quizzes/:slug/duplicate", async (req, res) => {
    const src = await deps.store.getQuiz(req.params.slug);
    if (!src) {
      res.status(404).json({ error: "Source quiz not found." });
      return;
    }
    const newSlug = String((req.body as Record<string, unknown>)?.slug ?? `${src.slug}-copy`)
      .trim()
      .toLowerCase();
    const copy: QuizDefinition = {
      ...structuredClone(src),
      slug: newSlug,
      title: `${src.title} (Copy)`,
      status: "draft",
    };
    const check = validateQuizDefinition(copy);
    if (!check.valid || !check.normalized) {
      res.status(400).json({ errors: check.errors });
      return;
    }
    if (await deps.store.getQuiz(newSlug)) {
      res.status(409).json({ error: `Slug '${newSlug}' already exists.` });
      return;
    }
    const rev = await deps.store.saveQuiz(check.normalized, `Duplicated from ${src.slug}`);
    res.status(201).json(rev.definition);
  });

  router.post("/api/admin/quizzes/:slug/status", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const nextStatus = (req.body as Record<string, unknown>)?.status;
    if (nextStatus !== "draft" && nextStatus !== "published") {
      res.status(400).json({ error: "status must be 'draft' or 'published'." });
      return;
    }
    const rev = await deps.store.saveQuiz(
      { ...quiz, status: nextStatus },
      `Status changed to ${nextStatus}`,
    );
    res.json(rev.definition);
  });

  router.get("/api/admin/quizzes/:slug/revisions", async (req, res) => {
    const revs = await deps.store.listRevisions(req.params.slug);
    res.json(revs);
  });

  router.post("/api/admin/quizzes/:slug/revisions/:revisionId/restore", async (req, res) => {
    const restored = await deps.store.restoreRevision(
      req.params.slug,
      req.params.revisionId,
    );
    if (!restored) {
      res.status(404).json({ error: "Revision not found." });
      return;
    }
    res.json(restored);
  });

  router.post("/api/admin/preview", (req, res) => {
    const raw = req.body as QuizDefinition;
    const html = renderQuizHtml(raw, {
      turnstileSiteKey: deps.config.turnstileSiteKey,
      submitEndpoint: `/api/quizzes/${encodeURIComponent(raw.slug || "preview")}/submit`,
      previewMode: true,
      standalone: false,
    });
    res.type("text/html; charset=utf-8").send(html);
  });

  router.get("/api/admin/quizzes/:slug/standalone", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const defaultEndpoint = `${req.protocol}://${req.get("host") || "localhost"}/api/quizzes/${encodeURIComponent(quiz.slug)}/submit`;
    const endpoint = String(req.query.endpoint ?? "").trim() || defaultEndpoint;

    const html = renderQuizHtml(quiz, {
      turnstileSiteKey: deps.config.turnstileSiteKey,
      submitEndpoint: endpoint,
      previewMode: false,
      standalone: true,
    });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quiz.slug}-standalone.html"`,
    );
    res.type("text/html; charset=utf-8").send(html);
  });

  router.get("/api/admin/quizzes/:slug/export", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const submissions = await deps.store.listSubmissionsBySlug(quiz.slug);
    const csv = buildSubmissionsCsv(quiz, submissions);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quiz.slug}-submissions.csv"`,
    );
    res.send(csv);
  });

  router.post("/api/admin/retry", async (_req, res) => {
    const summary = await runRetrySweep(deps.store, deps.config, fetchFn, 25);
    res.json(summary);
  });

  return router;
}
