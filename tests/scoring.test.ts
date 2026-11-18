import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  priorityFlag,
  renderFallbackParagraph,
  scoreAnswers,
  pointsForAnswer,
} from "../src/domain/scoring.js";
import { computeQuizStats } from "../src/domain/stats.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";
import type { QuizDefinition, SubmissionDocument } from "../src/types.js";

const seed = loadSeedDefinition();

function buildAnswersWithTargetTotal(targetTotal: number): Record<string, string> {
  const answers: Record<string, string> = {};
  let remaining = targetTotal;
  for (const q of seed.scoredQuestions) {
    const pts = Math.min(3, remaining);
    remaining -= pts;
    const opt = q.options.find((o) => o.points === pts);
    assert.ok(opt, `missing ${pts}-pt option on ${q.id}`);
    answers[q.id] = opt.text;
  }
  assert.equal(remaining, 0);
  return answers;
}

describe("Acceptance Test 1: Scoring vectors on seed", () => {
  it("scores all-best as 100% Band 4 (total 27 / max 27) with Band 4 strength-framed copy", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 3)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 27);
    assert.equal(res.maxPoints, 27);
    assert.equal(res.readinessPct, 100);
    assert.equal(res.band.band, 4);
    assert.equal(res.band.label, "Hybrid ready");
    assert.equal(
      res.gapHeadline,
      "Everyone is seen and heard + Everyone can contribute + Your spaces keep up",
    );
    assert.equal(
      res.gapTip,
      "People can see and hear each other clearly, in the room and remotely. Remote colleagues add to the work in real time, not after the fact. Your rooms fit how people meet now, and someone owns keeping them that way.",
    );
  });

  it("scores all-worst as 0% Band 1 (total 0 / max 27)", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 0)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 0);
    assert.equal(res.maxPoints, 27);
    assert.equal(res.readinessPct, 0);
    assert.equal(res.band.band, 1);
    assert.equal(res.band.label, "Getting started");
  });

  it("scores all-2-points as 67% Band 3 (total 18 / max 27)", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 2)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 18);
    assert.equal(res.maxPoints, 27);
    assert.equal(res.readinessPct, 67);
    assert.equal(res.band.band, 3);
    assert.equal(res.band.label, "Nearly there");
  });

  it("places boundary raw totals (10/11, 17/18, 22/23) in the right bands", () => {
    const cases: Array<[number, number, number]> = [
      [10, 37, 1],
      [11, 41, 2],
      [17, 63, 2],
      [18, 67, 3],
      [22, 81, 3],
      [23, 85, 4],
    ];
    for (const [raw, expectedPct, expectedBand] of cases) {
      const res = scoreAnswers(seed, buildAnswersWithTargetTotal(raw));
      assert.equal(res.totalPoints, raw);
      assert.equal(res.readinessPct, expectedPct, `raw=${raw}`);
      assert.equal(res.band.band, expectedBand, `raw=${raw}`);
    }
  });

  it("returns all tied lowest areas as biggestGap", () => {
    const answers: Record<string, string> = {};
    for (const q of seed.scoredQuestions) {
      // being_seen_and_heard and working_together get 0 pts (0%), spaces_and_support gets 3 pts (100%)
      const pts =
        q.area === "being_seen_and_heard" || q.area === "working_together"
          ? 0
          : 3;
      answers[q.id] = q.options.find((o) => o.points === pts)!.text;
    }
    const res = scoreAnswers(seed, answers);
    assert.deepEqual(res.biggestGap, [
      "being_seen_and_heard",
      "working_together",
    ]);
    assert.equal(
      res.gapHeadline,
      "Not everyone feels present + Remote colleagues are on the sidelines",
    );
    assert.ok(res.gapTip.includes("switch off and stop contributing"));
    assert.ok(res.gapTip.includes("good ideas from remote colleagues get lost"));
  });

  it("rejects unknown answer texts and missing questions", () => {
    assert.throws(
      () => pointsForAnswer(seed, "q1", "Completely fabricated answer"),
      /unknown answer/,
    );
    const answers = buildAnswersWithTargetTotal(18);
    answers.q5 = "Not a real option";
    assert.throws(() => scoreAnswers(seed, answers), /unknown answer/);
  });

  it("evaluates priority-rule truth table across band x role x office size", () => {
    const cases: Array<[number, string, string, boolean]> = [
      // Band 1 & 2 with priority role + priority size -> true
      [1, "IT", "500–1,999", true],
      [2, "Workplace / Real estate / Facilities", "2,000+", true],
      [2, "Business leader", "500_1999", true],
      [1, "it", "2000_plus", true],
      // Non-priority role -> false
      [1, "HR / People", "2,000+", false],
      [2, "other", "500–1,999", false],
      // Non-priority office size -> false
      [1, "IT", "Under 100", false],
      [2, "Business leader", "100–499", false],
      // Band 3 & 4 -> always false
      [3, "IT", "2,000+", false],
      [4, "Workplace / Real estate / Facilities", "2,000+", false],
    ];

    for (const [band, role, size, expected] of cases) {
      const actual = priorityFlag(seed, band, {
        p1: role,
        p2: "Tech",
        p3: size,
        p4: "Southeast Asia",
      });
      assert.equal(
        actual,
        expected,
        `band=${band}, role=${role}, size=${size}`,
      );
    }
  });

  it("computes max points dynamically from definition (not hardcoded 45)", () => {
    const custom: QuizDefinition = {
      ...structuredClone(seed),
      areas: [{ key: "alpha", name: "Alpha" }],
      scoredQuestions: [
        {
          id: "c1",
          area: "alpha",
          text: "Q1",
          options: [{ points: 10, text: "Ten" }, { points: 0, text: "Zero" }],
        },
        {
          id: "c2",
          area: "alpha",
          text: "Q2",
          options: [{ points: 5, text: "Five" }, { points: 0, text: "Zero" }],
        },
      ],
    };
    const res = scoreAnswers(custom, { c1: "Ten", c2: "Zero" });
    assert.equal(res.totalPoints, 10);
    assert.equal(res.maxPoints, 15);
    assert.equal(res.readinessPct, 67);
    assert.ok(renderFallbackParagraph(custom, res).includes("67%"));
  });

  it("dedupes stats by respondent email (trimmed, lowercased) keeping latest completed-at while counting all attempts in totalAttempts", () => {
    const worstAnswers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 0)!.text]),
    );
    const midAnswers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 2)!.text]),
    );
    const bestAnswers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options.find((o) => o.points === 3)!.text]),
    );

    const makeSub = (
      id: string,
      email: string,
      answers: Record<string, string>,
      completedIso: string,
    ): SubmissionDocument => ({
      id,
      slug: seed.slug,
      email,
      firstName: "Test",
      lastName: "User",
      company: "Co",
      source: "public",
      profile: { p1: "it", p2: "tech", p3: "500_1999", p4: "southeast_asia" },
      answers,
      result: scoreAnswers(seed, answers),
      priorityFollowup: false,
      consentTextVersion: "consent-2026-11-v2",
      consentTimestamp: completedIso,
      pageUri: "https://steelcase-hybrid-workplace.enablly.com/q/hybrid-meeting-readiness",
      attempt_count: 1,
      first_submitted_at: completedIso,
      last_submitted_at: completedIso,
      last_client_uuid: id,
      gemini_status: "fallback",
      gemini_text: "",
      hubspot_status: "synced",
      sync_attempts: 1,
    });

    // Alice's LATER attempt (100% Band 4 at 12:00) is placed BEFORE her EARLIER attempt (0% Band 1 at 08:00)
    // to prove timestamp comparison (not just array order) picks the latest attempt.
    // Bob submits once (67% Band 3 at 09:00).
    const subs: SubmissionDocument[] = [
      makeSub("sub-alice-latest", "  ALICE@ACME.COM ", bestAnswers, "2026-11-18T12:00:00.000Z"),
      makeSub("sub-alice-earlier", "alice@acme.com", worstAnswers, "2026-11-18T08:00:00.000Z"),
      makeSub("sub-bob", "bob@acme.com", midAnswers, "2026-11-18T09:00:00.000Z"),
    ];

    const stats = computeQuizStats(seed, subs);
    assert.equal(stats.respondents, 2);
    assert.equal(stats.totalCompletions, 2);
    assert.equal(stats.totalAttempts, 3);
    // Alice latest (100%, 27 pts) + Bob (67%, 18 pts) -> avg readiness = Math.round(167/2) = 84%, avg pts = 22.5
    assert.equal(stats.averageReadinessPct, 84);
    assert.equal(stats.averageTotalPoints, 22.5);
    assert.equal(stats.bands.find((b) => b.band === 1)?.count, 0); // Alice's earlier Band 1 superseded
    assert.equal(stats.bands.find((b) => b.band === 3)?.count, 1); // Bob
    assert.equal(stats.bands.find((b) => b.band === 4)?.count, 1); // Alice's latest
    assert.equal(stats.areas[0]?.averageScore, 7.5); // (9 + 6) / 2
  });
});
