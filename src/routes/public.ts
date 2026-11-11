import { Router } from "express";
import type { AppConfig } from "../config.js";
import { priorityFlag, scoreAnswers, validateProfile } from "../domain/scoring.js";
import { renderQuizHtml } from "../render/quiz-html.js";
import { syncSubmission } from "../services/sync-pipeline.js";
import { verifyTurnstile } from "../services/turnstile.js";
import { submissionDocId, type QuizStore } from "../store/store.js";
import type { QuizDefinition, ScoreResult, SubmissionDocument } from "../types.js";
import { parseCookies } from "./auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function buildPublicResultsPayload(
  quiz: QuizDefinition,
  r: ScoreResult,
  attemptCount: number,
  submissionId: string,
) {
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const gapCopy = quiz.scoring.gapCopy ?? {};
  const closingLine =
    quiz.closing.livePhase === "post"
      ? quiz.closing.postEvent
      : quiz.closing.preEvent;

  return {
    submissionId,
    attemptCount,
    totalPoints: r.totalPoints,
    maxPoints: r.maxPoints,
    readinessPct: r.readinessPct,
    band: r.band,
    areaScores: r.areaScores,
    areaMaxScores: r.areaMaxScores,
    areaPcts: r.areaPcts,
    biggestGap: r.biggestGap,
    gapCards: r.biggestGap.map((k) => ({
      areaKey: k,
      areaName: areaNameByKey.get(k) ?? k,
      pct: r.areaPcts[k] ?? 0,
      headline: gapCopy[k]?.headline ?? k,
      tip: gapCopy[k]?.tip ?? "",
    })),
    closingLine,
  };
}

export interface PublicRouterDeps {
  store: QuizStore;
  config: AppConfig;
  fetchFn?: typeof fetch;
  onAsyncSync?: (p: Promise<unknown>) => void;
}

export function createPublicRouter(deps: PublicRouterDeps): Router {
  const router = Router();
  const fetchFn = deps.fetchFn ?? fetch;

  router.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/", async (_req, res) => {
    const quizzes = await deps.store.listQuizzes();
    const published = quizzes.filter((q) => q.status === "published");
    if (published.length === 1) {
      res.redirect(`/q/${encodeURIComponent(published[0]!.slug)}`);
      return;
    }
    res.type("html").send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quiz Designer</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:3rem auto;padding:0 1rem;color:#111827}a{color:#6b4fbb;font-weight:600}</style></head><body><h1>Assessments</h1>${
      published.length
        ? `<ul>${published.map((q) => `<li><a href="/q/${encodeURIComponent(q.slug)}">${q.title}</a></li>`).join("")}</ul>`
        : `<p>No published quizzes yet. Visit <a href="/admin">/admin</a> to configure and publish a quiz.</p>`
    }</body></html>`);
  });

  router.get("/q/:slug", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz || quiz.status !== "published") {
      res.status(404).type("text/html; charset=utf-8").send("<h1>Quiz not found</h1><p>This assessment is not published or does not exist.</p>");
      return;
    }

    const html = renderQuizHtml(quiz, {
      turnstileSiteKey: deps.config.turnstileSiteKey,
      submitEndpoint: `/api/quizzes/${encodeURIComponent(quiz.slug)}/submit`,
      previewMode: false,
      standalone: false,
    });
    res.type("text/html; charset=utf-8").send(html);
  });

  router.post("/api/quizzes/:slug/submit", async (req, res) => {
    const quiz = await deps.store.getQuiz(req.params.slug);
    if (!quiz || quiz.status !== "published") {
      res.status(404).json({ error: "Published quiz not found." });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // 1. Verify Turnstile server-side (fail closed if secret unset)
    const turnstileToken = String(
      body.turnstileToken ?? body["cf-turnstile-response"] ?? "",
    );
    const remoteIp =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress;
    const turnstile = await verifyTurnstile(
      deps.config.turnstileSecretKey,
      turnstileToken,
      remoteIp,
      fetchFn,
    );
    if (!turnstile.ok) {
      res.status(403).json({ error: turnstile.reason ?? "Turnstile check failed." });
      return;
    }

    // 2. Validate consent version
    const consentAccepted = body.consentAccepted === true;
    const consentTextVersion = String(body.consentTextVersion ?? "").trim();
    if (!consentAccepted || consentTextVersion !== quiz.consent.textVersion) {
      res.status(400).json({
        error: "Valid consent matching the current consent textVersion is required.",
      });
      return;
    }

    // 3. Validate identity
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const company = String(body.company ?? "").trim();
    const emailRaw = String(body.email ?? "").trim();
    const email = emailRaw.toLowerCase();

    if (!firstName) {
      res.status(400).json({ error: "First name is required." });
      return;
    }
    if (!company) {
      res.status(400).json({ error: "Company is required." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    const rawSource = String(body.source ?? "").trim();
    const source =
      rawSource && (quiz.sources.length === 0 || quiz.sources.includes(rawSource))
        ? rawSource
        : "public";

    // 4. Validate profile and re-score answers from texts
    const profile = (body.profile ?? {}) as Record<string, string>;
    const answers = (body.answers ?? {}) as Record<string, string>;

    let scoreResult: ScoreResult;
    try {
      validateProfile(quiz, profile);
      scoreResult = scoreAnswers(quiz, answers);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    // 5. Idempotency + Store-first
    const docId = submissionDocId(quiz.slug, email);
    const clientUuid = String(body.clientSubmissionId ?? "").trim() || `srv_${Date.now()}`;
    const existing = await deps.store.getSubmission(docId);

    if (existing && existing.last_client_uuid === clientUuid) {
      res.json(
        buildPublicResultsPayload(
          quiz,
          existing.result,
          existing.attempt_count,
          existing.id,
        ),
      );
      return;
    }

    const now = new Date().toISOString();
    const cookies = parseCookies(req.headers.cookie);
    const hutk = String(body.hutk ?? cookies.hubspotutk ?? "").trim();
    const pageUri =
      String(body.pageUri ?? "").trim() ||
      `${req.protocol}://${req.get("host") || "localhost"}/q/${quiz.slug}`;
    const priorityFollowup = priorityFlag(quiz, scoreResult.band.band, profile);

    const doc: SubmissionDocument = {
      id: docId,
      slug: quiz.slug,
      email,
      firstName,
      lastName,
      company,
      source,
      profile,
      answers,
      result: scoreResult,
      priorityFollowup,
      consentTextVersion,
      consentTimestamp: String(body.consentTimestamp ?? now),
      pageUri,
      ...(hutk ? { hutk } : {}),
      attempt_count: existing ? existing.attempt_count + 1 : 1,
      first_submitted_at: existing ? existing.first_submitted_at : now,
      last_submitted_at: now,
      last_client_uuid: clientUuid,
      gemini_status: "fallback",
      gemini_text: "",
      hubspot_status: "pending",
      sync_attempts: 0,
    };

    await deps.store.saveSubmission(doc);

    // 6. Respond immediately with public results
    res.json(
      buildPublicResultsPayload(quiz, scoreResult, doc.attempt_count, doc.id),
    );

    // 7. Run Gemini + HubSpot sync pipeline asynchronously
    const runSync = () => {
      const p = syncSubmission(deps.store, deps.config, quiz, doc, fetchFn).catch(
        (err) => {
          console.error("Async submission sync failed:", err);
        },
      );
      if (deps.onAsyncSync) deps.onAsyncSync(p);
    };
    setImmediate(runSync);
  });

  return router;
}
