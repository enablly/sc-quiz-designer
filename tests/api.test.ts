import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { ensureSeedImported, loadSeedDefinition } from "../src/services/seed-loader.js";
import { MemoryStore } from "../src/store/memory-store.js";

const seed = loadSeedDefinition();

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    adminToken: "secret-admin-token",
    turnstileSiteKey: "site-key",
    turnstileSecretKey: "turnstile-secret",
    hubspotPortalId: "99999",
    hubspotFormGuid: "form-guid",
    hubspotRegion: "us",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash-lite",
    googleCloudProject: "",
    useMemoryStore: true,
    ...overrides,
  };
}

async function startTestServer(
  config: AppConfig,
  fetchFn?: typeof fetch,
) {
  const store = new MemoryStore();
  await ensureSeedImported(store);
  const pendingSyncs: Promise<unknown>[] = [];
  const app = createApp({
    store,
    config,
    fetchFn,
    onAsyncSync: (p) => pendingSyncs.push(p),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    store,
    baseUrl,
    flushSyncs: () => Promise.all(pendingSyncs),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function validSubmissionBody(overrides: Record<string, unknown> = {}) {
  const answers = Object.fromEntries(
    seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 2)!.text]),
  );
  return {
    clientSubmissionId: "uuid-1",
    consentAccepted: true,
    consentTextVersion: seed.consent.textVersion,
    consentTimestamp: "2026-11-25T10:00:00.000Z",
    firstName: "Jane",
    lastName: "Doe",
    email: "Jane.Doe@Company.com",
    company: "Acme",
    source: "linkedin",
    profile: { p1: "it", p2: "tech", p3: "500_1999", p4: "singapore" },
    answers,
    turnstileToken: "valid-token",
    ...overrides,
  };
}

describe("Engine, Admin API, Retries, and CSV Export", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it("blocks draft quiz publicly until published, and fails closed when Turnstile secret is unset", async () => {
    const srv = await startTestServer(makeConfig({ turnstileSecretKey: "" }));
    cleanup = srv.close;

    // Draft returns 404 on /q/:slug
    const rDraft = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness`);
    assert.equal(rDraft.status, 404);

    // Publish via admin API
    const rPub = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-token",
      },
      body: JSON.stringify({ status: "published" }),
    });
    assert.equal(rPub.status, 200);

    const rLive = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness`);
    assert.equal(rLive.status, 200);

    // Submit fails closed when TURNSTILE_SECRET_KEY is unset
    const rSub = await fetch(`${srv.baseUrl}/api/quizzes/hybrid-meeting-readiness/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSubmissionBody()),
    });
    assert.equal(rSub.status, 403);
  });

  it("handles idempotency, retakes, store-first sync, retry sweep, and CSV priority ordering", async () => {
    let hubspotShouldFail = false;
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("turnstile")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes("hsforms.com")) {
        if (hubspotShouldFail) return new Response("upstream error", { status: 500 });
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const srv = await startTestServer(makeConfig(), mockFetch);
    cleanup = srv.close;

    // Publish seed
    await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-token",
      },
      body: JSON.stringify({ status: "published" }),
    });

    // 1. First submission -> idempotent check
    const res1 = await fetch(`${srv.baseUrl}/api/quizzes/hybrid-meeting-readiness/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSubmissionBody({ clientSubmissionId: "uuid-1" })),
    });
    assert.equal(res1.status, 200);
    const data1 = (await res1.json()) as { readinessPct: number; attemptCount: number; gemini_text?: string };
    assert.equal(data1.readinessPct, 67);
    assert.equal(data1.attemptCount, 1);
    assert.equal(data1.gemini_text, undefined); // email-only!

    await srv.flushSyncs();

    // Resubmit same clientSubmissionId -> idempotent
    const resDup = await fetch(`${srv.baseUrl}/api/quizzes/hybrid-meeting-readiness/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validSubmissionBody({ clientSubmissionId: "uuid-1" })),
    });
    const dataDup = (await resDup.json()) as { attemptCount: number };
    assert.equal(dataDup.attemptCount, 1);

    // Retake with new clientSubmissionId while HubSpot fails -> pending & attempt_count = 2
    hubspotShouldFail = true;
    const worstAnswers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 0)!.text]),
    );
    const resRetake = await fetch(`${srv.baseUrl}/api/quizzes/hybrid-meeting-readiness/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validSubmissionBody({ clientSubmissionId: "uuid-2", answers: worstAnswers }),
      ),
    });
    const dataRetake = (await resRetake.json()) as { attemptCount: number; readinessPct: number };
    assert.equal(dataRetake.attemptCount, 2);
    assert.equal(dataRetake.readinessPct, 0);
    await srv.flushSyncs();

    // Also submit a non-priority Band 4 respondent
    const bestAnswers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 3)!.text]),
    );
    await fetch(`${srv.baseUrl}/api/quizzes/hybrid-meeting-readiness/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validSubmissionBody({
          clientSubmissionId: "uuid-3",
          email: "nonpriority@other.com",
          profile: { p1: "other", p2: "other", p3: "under_100", p4: "other" },
          answers: bestAnswers,
        }),
      ),
    });
    await srv.flushSyncs();

    // Retry sweep now succeeds
    hubspotShouldFail = false;
    const rRetry = await fetch(`${srv.baseUrl}/api/admin/retry`, {
      method: "POST",
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rRetry.status, 200);
    const retrySummary = (await rRetry.json()) as { processed: number; synced: number };
    assert.equal(retrySummary.processed, 2);
    assert.equal(retrySummary.synced, 2);

    // Export CSV -> priority row (jane.doe@company.com, band 1) must come before nonpriority@other.com (band 4)
    const rCsv = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/export`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rCsv.status, 200);
    const csvText = await rCsv.text();
    const lines = csvText.trim().split(/\r?\n/);
    assert.equal(lines.length, 3); // header + 2 respondents
    assert.ok(lines[1]!.startsWith("jane.doe@company.com,"));
    assert.ok(lines[2]!.startsWith("nonpriority@other.com,"));
  });

  it("caps revisions at 10 and supports one-click restore + unauthorized rejection", async () => {
    const srv = await startTestServer(makeConfig());
    cleanup = srv.close;

    const rUnauth = await fetch(`${srv.baseUrl}/api/admin/quizzes`);
    assert.equal(rUnauth.status, 401);

    for (let i = 1; i <= 12; i++) {
      const updated = { ...structuredClone(seed), title: `Title v${i}` };
      const rSave = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-admin-token",
        },
        body: JSON.stringify(updated),
      });
      assert.equal(rSave.status, 200);
    }

    const rRevs = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/revisions`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    const revs = (await rRevs.json()) as Array<{ revisionId: string; definition: { title: string } }>;
    assert.equal(revs.length, 10);

    const oldestKept = revs[revs.length - 1]!;
    const rRestore = await fetch(
      `${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/revisions/${oldestKept.revisionId}/restore`,
      {
        method: "POST",
        headers: { Authorization: "Bearer secret-admin-token" },
      },
    );
    assert.equal(rRestore.status, 200);
    const restored = (await rRestore.json()) as { title: string };
    assert.equal(restored.title, oldestKept.definition.title);
  });
});
