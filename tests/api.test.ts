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
    gcsLogoBucket: "test-bucket",
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
    profile: { p1: "it", p2: "tech", p3: "500_1999", p4: "southeast_asia" },
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
          profile: { p1: "other", p2: "other", p3: "under_100", p4: "others" },
          profileOther: { p1: "AV Consultant", p2: "Biotech", p4: "Middle East" },
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

    // Verify admin submissions view includes profileOther free-text values
    const rSubs = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/submissions`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rSubs.status, 200);
    const subs = (await rSubs.json()) as Array<{ email: string; profileOther?: Record<string, string> }>;
    const otherSub = subs.find((s) => s.email === "nonpriority@other.com");
    assert.ok(otherSub);
    assert.deepEqual(otherSub.profileOther, {
      p1: "AV Consultant",
      p2: "Biotech",
      p4: "Middle East",
    });

    // Export CSV -> priority row (jane.doe@company.com, band 1) must come before nonpriority@other.com (band 4)
    // and include profile_p1_other, profile_p2_other, profile_p4_other columns
    const rCsv = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/export`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rCsv.status, 200);
    const csvText = await rCsv.text();
    const lines = csvText.trim().split(/\r?\n/);
    assert.equal(lines.length, 3); // header + 2 respondents
    assert.ok(lines[0]!.includes("profile_p1_other"));
    assert.ok(lines[0]!.includes("profile_p2_other"));
    assert.ok(lines[0]!.includes("profile_p4_other"));
    assert.ok(lines[1]!.startsWith("jane.doe@company.com,"));
    assert.ok(lines[2]!.startsWith("nonpriority@other.com,"));
    assert.ok(lines[2]!.includes("AV Consultant"));
    assert.ok(lines[2]!.includes("Biotech"));
    assert.ok(lines[2]!.includes("Middle East"));

    // Verify Central Quiz Repository list includes totalCompletions and publicPath
    const rList = await fetch(`${srv.baseUrl}/api/admin/quizzes`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rList.status, 200);
    const quizList = (await rList.json()) as Array<{
      slug: string;
      status: string;
      publicPath: string;
      totalCompletions: number;
      averageReadinessPct: number;
    }>;
    const repoItem = quizList.find((q) => q.slug === "hybrid-meeting-readiness");
    assert.ok(repoItem);
    assert.equal(repoItem.publicPath, "/q/hybrid-meeting-readiness");
    assert.equal(repoItem.totalCompletions, 2);
    assert.equal(repoItem.averageReadinessPct, 50); // (0% + 100%) / 2

    // Verify server-side per-quiz statistics & per-question breakdown (no PII!)
    const rStats = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/stats`, {
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rStats.status, 200);
    const statsRaw = await rStats.text();
    assert.ok(!statsRaw.includes("jane.doe@company.com"), "Stats response must not expose respondent emails");
    assert.ok(!statsRaw.includes("nonpriority@other.com"), "Stats response must not expose respondent emails");
    assert.ok(!statsRaw.includes("Jane Doe"), "Stats response must not expose respondent names");

    const stats = JSON.parse(statsRaw) as {
      totalCompletions: number;
      averageReadinessPct: number;
      bands: Array<{ band: number; count: number; pct: number }>;
      areas: Array<{ key: string; averagePct: number; averageScore: number; maxScore: number }>;
      profileQuestions: Array<{
        id: string;
        totalResponses: number;
        options: Array<{ code: string; count: number; pct: number; isMostPicked: boolean }>;
      }>;
      scoredQuestions: Array<{
        id: string;
        totalResponses: number;
        options: Array<{ text: string; points: number; count: number; pct: number; isMostPicked: boolean }>;
      }>;
    };
    assert.equal(stats.totalCompletions, 2);
    assert.equal(stats.averageReadinessPct, 50);
    assert.equal(stats.bands.find((b) => b.band === 1)?.count, 1);
    assert.equal(stats.bands.find((b) => b.band === 1)?.pct, 50);
    assert.equal(stats.bands.find((b) => b.band === 4)?.count, 1);
    assert.equal(stats.bands.find((b) => b.band === 4)?.pct, 50);
    assert.equal(stats.areas.length, 3);
    assert.equal(stats.areas[0]!.averagePct, 50);
    assert.equal(stats.areas[0]!.averageScore, 4.5);
    assert.equal(stats.areas[0]!.maxScore, 9);
    assert.equal(stats.profileQuestions.length, 4);
    assert.equal(stats.scoredQuestions.length, 9);
    const q1Stats = stats.scoredQuestions.find((q) => q.id === "q1")!;
    assert.equal(q1Stats.totalResponses, 2);
    assert.equal(q1Stats.options.filter((o) => o.isMostPicked).length, 2); // 1 pick for 3pt, 1 pick for 0pt -> tied at 1 (50% each)
  });

  it("uploads binary logo files to storage, serves them per quiz, copies them on duplicate, and removes cleanly", async () => {
    const srv = await startTestServer(makeConfig());
    cleanup = srv.close;

    const pngBuf = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const svgBuf = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      "utf8",
    );

    // Upload Logo 1 as raw binary PNG
    const rUp1 = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/logos/1`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Logo-Filename": "steelcase.png",
        "X-Logo-Alt": "Steelcase",
        Authorization: "Bearer secret-admin-token",
      },
      body: pngBuf,
    });
    assert.equal(rUp1.status, 200);
    const qAfter1 = (await rUp1.json()) as {
      theme: { logo1?: { objectKey: string; contentType: string; fileName?: string; alt?: string } };
    };
    assert.ok(qAfter1.theme.logo1?.objectKey.startsWith("quizzes/hybrid-meeting-readiness/logos/logo1-"));
    assert.equal(qAfter1.theme.logo1?.contentType, "image/png");
    assert.equal(qAfter1.theme.logo1?.fileName, "steelcase.png");
    // Ensure no base64 is stuffed into the quiz JSON
    assert.ok(!JSON.stringify(qAfter1).includes("iVBORw0KGgo"));

    // Upload Logo 2 as raw binary SVG
    const rUp2 = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/logos/2`, {
      method: "POST",
      headers: {
        "Content-Type": "image/svg+xml",
        "X-Logo-Filename": "logitech.svg",
        "X-Logo-Alt": "Logitech",
        Authorization: "Bearer secret-admin-token",
      },
      body: svgBuf,
    });
    assert.equal(rUp2.status, 200);

    // Serve Logo 1 and Logo 2
    const rGet1 = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness/logos/1`);
    assert.equal(rGet1.status, 200);
    assert.equal(rGet1.headers.get("content-type"), "image/png");
    const servedPng = Buffer.from(await rGet1.arrayBuffer());
    assert.deepEqual(servedPng, pngBuf);

    const rGet2 = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness/logos/2`);
    assert.equal(rGet2.status, 200);
    assert.equal(rGet2.headers.get("content-type"), "image/svg+xml");

    // Duplicate quiz -> logo files are copied in storage to the new quiz's namespace
    const rDup = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-admin-token",
      },
      body: JSON.stringify({ slug: "hybrid-copy" }),
    });
    assert.equal(rDup.status, 201);
    const dupQuiz = (await rDup.json()) as {
      theme: { logo1?: { objectKey: string }; logo2?: { objectKey: string } };
    };
    assert.ok(dupQuiz.theme.logo1?.objectKey.startsWith("quizzes/hybrid-copy/logos/logo1-"));
    assert.ok(dupQuiz.theme.logo2?.objectKey.startsWith("quizzes/hybrid-copy/logos/logo2-"));

    // Delete Logo 1 on the original quiz -> original returns 404 for Logo 1, but duplicate still serves its copied Logo 1!
    const rDel1 = await fetch(`${srv.baseUrl}/api/admin/quizzes/hybrid-meeting-readiness/logos/1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer secret-admin-token" },
    });
    assert.equal(rDel1.status, 200);

    const rGet1After = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness/logos/1`);
    assert.equal(rGet1After.status, 404);
    const rGet2After = await fetch(`${srv.baseUrl}/q/hybrid-meeting-readiness/logos/2`);
    assert.equal(rGet2After.status, 200);

    const rDupLogo1 = await fetch(`${srv.baseUrl}/q/hybrid-copy/logos/1`);
    assert.equal(rDupLogo1.status, 200);
    assert.deepEqual(Buffer.from(await rDupLogo1.arrayBuffer()), pngBuf);
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
