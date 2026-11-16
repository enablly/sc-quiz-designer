import crypto from "node:crypto";
import express, { Router } from "express";
import type { AppConfig } from "../config.js";
import { buildSubmissionsCsv, sortSubmissionsForExport } from "../domain/csv.js";
import { computeQuizStats } from "../domain/stats.js";
import { validateQuizDefinition } from "../domain/validator.js";
import { renderAdminBuilderHtml, renderAdminLoginHtml } from "../render/admin-html.js";
import { renderQuizHtml } from "../render/quiz-html.js";
import { runRetrySweep } from "../services/sync-pipeline.js";
import type { LogoStore } from "../store/logo-store.js";
import type { QuizStore } from "../store/store.js";
import type { QuizDefinition, QuizLogoSlot, QuizTheme } from "../types.js";
import {
  clearAdminSessionCookie,
  isAdminAuthenticated,
  requireAdminAuth,
  setAdminSessionCookie,
} from "./auth.js";

function detectLogoMimeAndExt(
  buf: Buffer,
  rawContentType: string,
): { contentType: string; ext: string } | null {
  if (!buf || buf.length === 0) return null;
  // Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  // Check JPEG magic bytes: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  // Check SVG XML content
  const headText = buf.subarray(0, Math.min(buf.length, 4096)).toString("utf8");
  const ct = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    (ct === "image/svg+xml" || ct === "application/octet-stream" || ct === "") &&
    /<svg[\s>]/i.test(headText)
  ) {
    return { contentType: "image/svg+xml", ext: "svg" };
  }
  return null;
}

function detectFaviconMimeAndExt(
  buf: Buffer,
): { contentType: string; ext: string } | null {
  if (!buf || buf.length === 0) return null;
  // Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  // Check ICO magic bytes: 00 00 01 00
  if (
    buf.length >= 4 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  ) {
    return { contentType: "image/x-icon", ext: "ico" };
  }
  return null;
}

function extFromLogoSlot(slot: QuizLogoSlot): string {
  if (slot.contentType === "image/jpeg") return "jpg";
  if (slot.contentType === "image/svg+xml") return "svg";
  if (
    slot.contentType === "image/x-icon" ||
    slot.contentType === "image/vnd.microsoft.icon"
  ) {
    return "ico";
  }
  const m = slot.objectKey.match(/\.(png|jpg|jpeg|svg|ico)$/i);
  return m ? m[1]!.toLowerCase() : "png";
}

async function copyQuizLogosToSlug(
  logoStore: LogoStore,
  theme: QuizTheme,
  targetSlug: string,
): Promise<QuizTheme> {
  const nextTheme: QuizTheme = structuredClone(theme);
  for (const [prefix, slotKey] of [
    ["logo1", "logo1"],
    ["logo2", "logo2"],
    ["favicon", "favicon"],
  ] as const) {
    const srcSlot = nextTheme[slotKey];
    if (!srcSlot?.objectKey) continue;
    const ext = extFromLogoSlot(srcSlot);
    const rand = crypto.randomBytes(6).toString("hex");
    const newObjectKey = `quizzes/${targetSlug}/logos/${prefix}-${Date.now()}-${rand}.${ext}`;
    const copied = await logoStore.copyLogo(srcSlot.objectKey, newObjectKey);
    if (copied) {
      nextTheme[slotKey] = {
        ...srcSlot,
        objectKey: newObjectKey,
        uploadedAt: new Date().toISOString(),
      };
    }
  }
  return nextTheme;
}

export interface AdminRouterDeps {
  store: QuizStore;
  logoStore: LogoStore;
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
    const enriched = await Promise.all(
      list.map(async (q) => {
        const subs = await deps.store.listSubmissionsBySlug(q.slug);
        const totalCompletions = subs.length;
        const averageReadinessPct =
          totalCompletions > 0
            ? Math.round(
                subs.reduce((s, r) => s + (r.result?.readinessPct ?? 0), 0) /
                  totalCompletions,
              )
            : null;
        return {
          ...q,
          publicPath: `/q/${encodeURIComponent(q.slug)}`,
          submissionCount: totalCompletions,
          totalCompletions,
          averageReadinessPct,
        };
      }),
    );
    res.json(enriched);
  });

  router.get("/api/admin/quizzes/:slug/stats", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const submissions = await deps.store.listSubmissionsBySlug(quiz.slug);
    res.json(computeQuizStats(quiz, submissions));
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
    const toSave = structuredClone(check.normalized);
    if (oldSlug !== newSlug) {
      const collision = await deps.store.getQuiz(newSlug);
      if (collision) {
        res.status(409).json({ error: `Cannot rename: slug '${newSlug}' already exists.` });
        return;
      }
      toSave.theme = await copyQuizLogosToSlug(deps.logoStore, toSave.theme, newSlug);
      await deps.store.deleteQuiz(oldSlug);
    }
    const rev = await deps.store.saveQuiz(toSave, "Saved from builder");
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
    if (await deps.store.getQuiz(newSlug)) {
      res.status(409).json({ error: `Slug '${newSlug}' already exists.` });
      return;
    }
    const copiedTheme = await copyQuizLogosToSlug(deps.logoStore, src.theme, newSlug);
    const copy: QuizDefinition = {
      ...structuredClone(src),
      slug: newSlug,
      title: `${src.title} (Copy)`,
      status: "draft",
      theme: copiedTheme,
    };
    const check = validateQuizDefinition(copy);
    if (!check.valid || !check.normalized) {
      res.status(400).json({ errors: check.errors });
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

  router.get("/api/admin/quizzes/:slug/submissions", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const submissions = await deps.store.listSubmissionsBySlug(quiz.slug);
    res.json(sortSubmissionsForExport(submissions));
  });

  router.post(
    "/api/admin/quizzes/:slug/logos/:slot",
    express.raw({
      type: [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/svg+xml",
        "application/octet-stream",
      ],
      limit: "5mb",
    }),
    async (req, res) => {
      const { slug, slot } = req.params;
      if (slot !== "1" && slot !== "2") {
        res.status(400).json({ error: "Logo slot must be '1' or '2'." });
        return;
      }
      const quiz = await deps.store.getQuiz(slug);
      if (!quiz) {
        res.status(404).json({ error: "Quiz not found." });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: "Please upload a valid PNG, JPG, or SVG image file.",
        });
        return;
      }
      const detected = detectLogoMimeAndExt(
        req.body,
        String(req.headers["content-type"] ?? ""),
      );
      if (!detected) {
        res.status(400).json({
          error: "Unsupported image file format. Please upload a PNG, JPG, or SVG file.",
        });
        return;
      }

      const rawFileName = String(req.headers["x-logo-filename"] ?? "").trim();
      let fileName = "";
      if (rawFileName) {
        try {
          fileName = decodeURIComponent(rawFileName).slice(0, 120);
        } catch {
          fileName = rawFileName.slice(0, 120);
        }
      }

      const rawAlt = String(req.headers["x-logo-alt"] ?? "").trim();
      let alt = "";
      if (rawAlt) {
        try {
          alt = decodeURIComponent(rawAlt).trim().slice(0, 120);
        } catch {
          alt = rawAlt.slice(0, 120);
        }
      }
      if (!alt) {
        alt = slot === "1" ? "Logo 1" : "Logo 2";
      }

      const rand = crypto.randomBytes(6).toString("hex");
      const objectKey = `quizzes/${quiz.slug}/logos/logo${slot}-${Date.now()}-${rand}.${detected.ext}`;

      try {
        await deps.logoStore.putLogo(objectKey, req.body, detected.contentType);
      } catch (err) {
        console.error("Failed to store logo in Cloud Storage:", err);
        res.status(500).json({
          error: "Failed to store logo file in Cloud Storage: " + (err as Error).message,
        });
        return;
      }

      const slotKey = slot === "1" ? "logo1" : "logo2";
      const updated: QuizDefinition = {
        ...structuredClone(quiz),
        theme: {
          ...quiz.theme,
          [slotKey]: {
            objectKey,
            contentType: detected.contentType,
            ...(fileName ? { fileName } : {}),
            alt,
            uploadedAt: new Date().toISOString(),
          },
        },
      };
      const rev = await deps.store.saveQuiz(updated, `Uploaded logo ${slot}`);
      res.json(rev.definition);
    },
  );

  router.delete("/api/admin/quizzes/:slug/logos/:slot", async (req, res) => {
    const { slug, slot } = req.params;
    if (slot !== "1" && slot !== "2") {
      res.status(400).json({ error: "Logo slot must be '1' or '2'." });
      return;
    }
    const quiz = await deps.store.getQuiz(slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const nextTheme = { ...quiz.theme };
    if (slot === "1") delete nextTheme.logo1;
    else delete nextTheme.logo2;
    const updated: QuizDefinition = {
      ...structuredClone(quiz),
      theme: nextTheme,
    };
    const rev = await deps.store.saveQuiz(updated, `Removed logo ${slot}`);
    res.json(rev.definition);
  });

  router.post(
    "/api/admin/quizzes/:slug/favicon",
    express.raw({
      type: [
        "image/png",
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "application/octet-stream",
      ],
      limit: "2mb",
    }),
    async (req, res) => {
      const { slug } = req.params;
      const quiz = await deps.store.getQuiz(slug);
      if (!quiz) {
        res.status(404).json({ error: "Quiz not found." });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({
          error: "Please upload a valid .ico or .png favicon file.",
        });
        return;
      }
      const detected = detectFaviconMimeAndExt(req.body);
      if (!detected) {
        res.status(400).json({
          error: "Unsupported favicon format. Please upload a .ico or .png file.",
        });
        return;
      }

      const rawFileName = String(req.headers["x-logo-filename"] ?? "").trim();
      let fileName = "";
      if (rawFileName) {
        try {
          fileName = decodeURIComponent(rawFileName).slice(0, 120);
        } catch {
          fileName = rawFileName.slice(0, 120);
        }
      }

      const rand = crypto.randomBytes(6).toString("hex");
      const objectKey = `quizzes/${quiz.slug}/logos/favicon-${Date.now()}-${rand}.${detected.ext}`;

      try {
        await deps.logoStore.putLogo(objectKey, req.body, detected.contentType);
      } catch (err) {
        console.error("Failed to store favicon in Cloud Storage:", err);
        res.status(500).json({
          error: "Failed to store favicon file in Cloud Storage: " + (err as Error).message,
        });
        return;
      }

      const updated: QuizDefinition = {
        ...structuredClone(quiz),
        theme: {
          ...quiz.theme,
          favicon: {
            objectKey,
            contentType: detected.contentType,
            ...(fileName ? { fileName } : {}),
            alt: "Favicon",
            uploadedAt: new Date().toISOString(),
          },
        },
      };
      const rev = await deps.store.saveQuiz(updated, "Uploaded favicon");
      res.json(rev.definition);
    },
  );

  router.delete("/api/admin/quizzes/:slug/favicon", async (req, res) => {
    const { slug } = req.params;
    const quiz = await deps.store.getQuiz(slug);
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const nextTheme = { ...quiz.theme };
    delete nextTheme.favicon;
    const updated: QuizDefinition = {
      ...structuredClone(quiz),
      theme: nextTheme,
    };
    const rev = await deps.store.saveQuiz(updated, "Removed favicon");
    res.json(rev.definition);
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
