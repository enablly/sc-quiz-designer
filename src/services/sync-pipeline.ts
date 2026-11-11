import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { generateParagraph } from "../domain/gemini.js";
import { pushToHubSpot } from "../domain/hubspot.js";
import type { QuizStore } from "../store/store.js";
import type { QuizDefinition, SubmissionDocument, SyncLogEntry } from "../types.js";

export async function syncSubmission(
  store: QuizStore,
  config: AppConfig,
  quiz: QuizDefinition,
  submission: SubmissionDocument,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; status: "synced" | "pending" | "failed" }> {
  let geminiText = submission.gemini_text;
  let geminiStatus = submission.gemini_status;

  if (!geminiText) {
    const g = await generateParagraph(
      {
        GEMINI_API_KEY: config.geminiApiKey,
        GEMINI_MODEL: config.geminiModel,
      },
      quiz,
      submission.result,
      fetchFn,
    );
    geminiText = g.text;
    geminiStatus = g.status;
    await store.updateSubmission(submission.id, {
      gemini_text: geminiText,
      gemini_status: geminiStatus,
    });
  }

  const nextAttempt = submission.sync_attempts + 1;
  const hsRes = await pushToHubSpot(
    {
      HUBSPOT_PORTAL_ID: config.hubspotPortalId,
      HUBSPOT_FORM_GUID: config.hubspotFormGuid,
      HUBSPOT_REGION: config.hubspotRegion,
    },
    quiz,
    {
      email: submission.email,
      firstName: submission.firstName,
      lastName: submission.lastName,
      company: submission.company,
      source: submission.source,
      profile: submission.profile,
      result: submission.result,
      geminiText,
      consentTextVersion: submission.consentTextVersion,
      submittedAtIso: submission.last_submitted_at,
      pageUri: submission.pageUri,
      ...(submission.hutk ? { hutk: submission.hutk } : {}),
    },
    fetchFn,
  );

  const now = new Date().toISOString();
  const logEntry: SyncLogEntry = {
    id: `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    submissionId: submission.id,
    slug: submission.slug,
    email: submission.email,
    attempt: nextAttempt,
    ok: hsRes.ok,
    httpStatus: hsRes.status,
    ...(hsRes.error ? { error: hsRes.error } : {}),
    createdAt: now,
  };
  await store.addSyncLog(logEntry);

  const nextStatus: "synced" | "pending" | "failed" = hsRes.ok
    ? "synced"
    : nextAttempt >= 5
      ? "failed"
      : "pending";

  await store.updateSubmission(submission.id, {
    sync_attempts: nextAttempt,
    hubspot_status: nextStatus,
    last_sync_at: now,
    ...(hsRes.error ? { last_sync_error: hsRes.error } : { last_sync_error: "" }),
  });

  return { ok: hsRes.ok, status: nextStatus };
}

export async function runRetrySweep(
  store: QuizStore,
  config: AppConfig,
  fetchFn: typeof fetch = fetch,
  limit = 25,
): Promise<{ processed: number; synced: number; failed: number; stillPending: number }> {
  const pending = await store.listPendingSubmissions(limit);
  let synced = 0;
  let failed = 0;
  let stillPending = 0;

  for (const sub of pending) {
    const quiz = await store.getQuiz(sub.slug);
    if (!quiz) {
      await store.updateSubmission(sub.id, {
        sync_attempts: sub.sync_attempts + 1,
        hubspot_status: sub.sync_attempts + 1 >= 5 ? "failed" : "pending",
        last_sync_error: `Quiz '${sub.slug}' not found`,
      });
      if (sub.sync_attempts + 1 >= 5) failed++;
      else stillPending++;
      continue;
    }

    const res = await syncSubmission(store, config, quiz, sub, fetchFn);
    if (res.status === "synced") synced++;
    else if (res.status === "failed") failed++;
    else stillPending++;
  }

  return {
    processed: pending.length,
    synced,
    failed,
    stillPending,
  };
}
